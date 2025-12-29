-- Hotel Check-in Kiosk System Database Schema for Local PostgreSQL
-- This combines all migrations from Supabase into a single file
-- Database: kiosk, User: orange, Password: 00oo00oo

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================
-- ENUM Types
-- ============================================
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('super_admin', 'project_admin', 'kiosk');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE kiosk_status AS ENUM ('online', 'offline', 'busy', 'error');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE voice_call_caller_type AS ENUM ('kiosk', 'manager');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ============================================
-- Users Table (replaces Supabase auth.users)
-- ============================================
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- Sessions Table (for authentication)
-- ============================================
CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

-- ============================================
-- Projects Table (Hotels)
-- ============================================
CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    logo_url TEXT,
    settings JSONB DEFAULT '{}'::jsonb,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- Profiles Table (Extended user info)
-- ============================================
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    full_name VARCHAR(255),
    role user_role NOT NULL DEFAULT 'kiosk',
    project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- Room Types Table (per project)
-- ============================================
CREATE TABLE IF NOT EXISTS room_types (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    base_price INTEGER DEFAULT 0,
    max_guests INTEGER DEFAULT 2,
    images JSONB DEFAULT '[]'::jsonb,
    is_active BOOLEAN DEFAULT true,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(project_id, name)
);

-- ============================================
-- Rooms Table (individual rooms with access details)
-- ============================================
CREATE TABLE IF NOT EXISTS rooms (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    room_type_id UUID REFERENCES room_types(id) ON DELETE SET NULL,
    room_number VARCHAR(50) NOT NULL,
    access_type VARCHAR(20) NOT NULL DEFAULT 'card',
    room_password VARCHAR(100),
    key_box_number VARCHAR(50),
    key_box_password VARCHAR(100),
    status VARCHAR(50) DEFAULT 'available',
    floor INTEGER,
    notes TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(project_id, room_number)
);

-- ============================================
-- Room Availability Table (daily counts per room type)
-- ============================================
CREATE TABLE IF NOT EXISTS room_availability (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_type_id UUID NOT NULL REFERENCES room_types(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    total_rooms INTEGER NOT NULL DEFAULT 0,
    available_rooms INTEGER NOT NULL DEFAULT 0,
    price_override INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(room_type_id, date)
);

-- ============================================
-- Room Daily Status Table (per-room per-day availability)
-- ============================================
CREATE TABLE IF NOT EXISTS room_daily_status (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    is_available BOOLEAN DEFAULT true,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(room_id, date)
);

-- ============================================
-- Reservations Table (for check-in validation)
-- ============================================
CREATE TABLE IF NOT EXISTS reservations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    room_type_id UUID REFERENCES room_types(id) ON DELETE SET NULL,
    reservation_number VARCHAR(100) NOT NULL,
    guest_name VARCHAR(255),
    guest_phone VARCHAR(50),
    guest_email VARCHAR(255),
    guest_count INTEGER DEFAULT 1,
    check_in_date DATE NOT NULL,
    check_out_date DATE NOT NULL,
    room_number VARCHAR(50),
    status VARCHAR(50) DEFAULT 'pending',
    source VARCHAR(100),
    notes TEXT,
    total_price INTEGER,
    payment_status VARCHAR(50) DEFAULT 'unpaid',
    data JSONB DEFAULT '{}'::jsonb,
    verification_data JSONB DEFAULT '[]'::jsonb,
    verified_guests JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(project_id, reservation_number)
);

-- ============================================
-- Kiosks Table (Physical kiosk devices)
-- ============================================
CREATE TABLE IF NOT EXISTS kiosks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,
    location VARCHAR(255),
    status kiosk_status DEFAULT 'offline',
    current_screen VARCHAR(100) DEFAULT 'start',
    current_session_id UUID,
    last_seen TIMESTAMP WITH TIME ZONE,
    settings JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- Kiosk Content Table (Customizable texts per project)
-- ============================================
CREATE TABLE IF NOT EXISTS kiosk_content (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    content_key VARCHAR(255) NOT NULL,
    content_value TEXT NOT NULL,
    language VARCHAR(10) DEFAULT 'ko',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(project_id, content_key, language)
);

-- ============================================
-- Video Call Sessions Table
-- ============================================
CREATE TABLE IF NOT EXISTS video_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    kiosk_id UUID NOT NULL REFERENCES kiosks(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    staff_user_id UUID REFERENCES profiles(id),
    room_name VARCHAR(255) NOT NULL,
    status VARCHAR(50) DEFAULT 'waiting',
    caller_type voice_call_caller_type DEFAULT 'kiosk',
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ended_at TIMESTAMP WITH TIME ZONE,
    notes TEXT
);

-- ============================================
-- Check-in Sessions Table (For tracking)
-- ============================================
CREATE TABLE IF NOT EXISTS checkin_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    kiosk_id UUID NOT NULL REFERENCES kiosks(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    guest_phone VARCHAR(50),
    guest_email VARCHAR(255),
    guest_count INTEGER DEFAULT 1,
    room_number VARCHAR(50),
    status VARCHAR(50) DEFAULT 'in_progress',
    current_step VARCHAR(100),
    data JSONB DEFAULT '{}'::jsonb,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE
);

-- ============================================
-- Identity Verification Records Table
-- ============================================
CREATE TABLE IF NOT EXISTS identity_verifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    reservation_id UUID REFERENCES reservations(id) ON DELETE SET NULL,
    guest_index INTEGER DEFAULT 0,
    guest_name VARCHAR(255),
    id_type VARCHAR(50),
    ocr_success BOOLEAN DEFAULT false,
    status_verified BOOLEAN DEFAULT false,
    status_verification_transaction_id VARCHAR(255),
    id_verified BOOLEAN DEFAULT false,
    liveness_passed BOOLEAN DEFAULT false,
    face_matched BOOLEAN DEFAULT false,
    similarity_score DECIMAL(5,4),
    liveness_score DECIMAL(5,4),
    is_adult BOOLEAN DEFAULT false,
    status VARCHAR(50) DEFAULT 'pending',
    failure_reason TEXT,
    verified_at TIMESTAMP WITH TIME ZONE,
    signature_name VARCHAR(255),
    signature_matched BOOLEAN,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- Payments Table
-- ============================================
CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    kiosk_id UUID REFERENCES kiosks(id) ON DELETE SET NULL,
    reservation_id UUID REFERENCES reservations(id) ON DELETE SET NULL,
    transaction_no VARCHAR(100) NOT NULL,
    order_num VARCHAR(255),
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    approval_num VARCHAR(100),
    approval_date VARCHAR(20),
    approval_time VARCHAR(20),
    card_num VARCHAR(50),
    card_name VARCHAR(100),
    amount INTEGER,
    tax INTEGER,
    installment INTEGER DEFAULT 0,
    error_code VARCHAR(50),
    error_message TEXT,
    raw_response JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- Signaling Messages Table (for WebRTC signaling)
-- ============================================
CREATE TABLE IF NOT EXISTS signaling_messages (
    id SERIAL PRIMARY KEY,
    session_id VARCHAR(255) NOT NULL,
    payload JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_signaling_session_id ON signaling_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_signaling_created_at ON signaling_messages(created_at);

-- ============================================
-- Indexes
-- ============================================
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_project_id ON profiles(project_id);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);
CREATE INDEX IF NOT EXISTS idx_kiosks_project_id ON kiosks(project_id);
CREATE INDEX IF NOT EXISTS idx_kiosks_status ON kiosks(status);
CREATE INDEX IF NOT EXISTS idx_kiosk_content_project_id ON kiosk_content(project_id);
CREATE INDEX IF NOT EXISTS idx_kiosk_content_key ON kiosk_content(content_key);
CREATE INDEX IF NOT EXISTS idx_video_sessions_kiosk_id ON video_sessions(kiosk_id);
CREATE INDEX IF NOT EXISTS idx_video_sessions_status ON video_sessions(status);
CREATE INDEX IF NOT EXISTS idx_checkin_sessions_kiosk_id ON checkin_sessions(kiosk_id);
CREATE INDEX IF NOT EXISTS idx_room_types_project_id ON room_types(project_id);
CREATE INDEX IF NOT EXISTS idx_room_availability_room_type_id ON room_availability(room_type_id);
CREATE INDEX IF NOT EXISTS idx_room_availability_project_id ON room_availability(project_id);
CREATE INDEX IF NOT EXISTS idx_room_availability_date ON room_availability(date);
CREATE INDEX IF NOT EXISTS idx_reservations_project_id ON reservations(project_id);
CREATE INDEX IF NOT EXISTS idx_reservations_reservation_number ON reservations(reservation_number);
CREATE INDEX IF NOT EXISTS idx_reservations_check_in_date ON reservations(check_in_date);
CREATE INDEX IF NOT EXISTS idx_reservations_guest_phone ON reservations(guest_phone);
CREATE INDEX IF NOT EXISTS idx_reservations_status ON reservations(status);
CREATE INDEX IF NOT EXISTS idx_rooms_project_id ON rooms(project_id);
CREATE INDEX IF NOT EXISTS idx_rooms_room_type_id ON rooms(room_type_id);
CREATE INDEX IF NOT EXISTS idx_rooms_status ON rooms(status);
CREATE INDEX IF NOT EXISTS idx_room_daily_status_room_id ON room_daily_status(room_id);
CREATE INDEX IF NOT EXISTS idx_room_daily_status_project_id ON room_daily_status(project_id);
CREATE INDEX IF NOT EXISTS idx_room_daily_status_date ON room_daily_status(date);
CREATE INDEX IF NOT EXISTS idx_identity_verifications_project_id ON identity_verifications(project_id);
CREATE INDEX IF NOT EXISTS idx_identity_verifications_reservation_id ON identity_verifications(reservation_id);
CREATE INDEX IF NOT EXISTS idx_identity_verifications_status ON identity_verifications(status);
CREATE INDEX IF NOT EXISTS idx_payments_project_id ON payments(project_id);
CREATE INDEX IF NOT EXISTS idx_payments_kiosk_id ON payments(kiosk_id);
CREATE INDEX IF NOT EXISTS idx_payments_reservation_id ON payments(reservation_id);
CREATE INDEX IF NOT EXISTS idx_payments_transaction_no ON payments(transaction_no);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_reservations_verified_guests ON reservations USING GIN (verified_guests);

-- ============================================
-- Functions
-- ============================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Triggers for updated_at
-- ============================================
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS update_projects_updated_at ON projects;
CREATE TRIGGER update_projects_updated_at
    BEFORE UPDATE ON projects
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS update_profiles_updated_at ON profiles;
CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS update_kiosks_updated_at ON kiosks;
CREATE TRIGGER update_kiosks_updated_at
    BEFORE UPDATE ON kiosks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS update_kiosk_content_updated_at ON kiosk_content;
CREATE TRIGGER update_kiosk_content_updated_at
    BEFORE UPDATE ON kiosk_content
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS update_room_types_updated_at ON room_types;
CREATE TRIGGER update_room_types_updated_at
    BEFORE UPDATE ON room_types
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS update_rooms_updated_at ON rooms;
CREATE TRIGGER update_rooms_updated_at
    BEFORE UPDATE ON rooms
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS update_room_availability_updated_at ON room_availability;
CREATE TRIGGER update_room_availability_updated_at
    BEFORE UPDATE ON room_availability
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS update_room_daily_status_updated_at ON room_daily_status;
CREATE TRIGGER update_room_daily_status_updated_at
    BEFORE UPDATE ON room_daily_status
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS update_reservations_updated_at ON reservations;
CREATE TRIGGER update_reservations_updated_at
    BEFORE UPDATE ON reservations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS update_identity_verifications_updated_at ON identity_verifications;
CREATE TRIGGER update_identity_verifications_updated_at
    BEFORE UPDATE ON identity_verifications
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS update_payments_updated_at ON payments;
CREATE TRIGGER update_payments_updated_at
    BEFORE UPDATE ON payments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- Default Content Template Function
-- ============================================
CREATE OR REPLACE FUNCTION create_default_content(p_project_id UUID)
RETURNS VOID AS $$
BEGIN
    INSERT INTO kiosk_content (project_id, content_key, content_value, language) VALUES
    (p_project_id, 'welcome_title', '환영합니다', 'ko'),
    (p_project_id, 'welcome_subtitle', '화면을 터치하여 체크인을 시작하세요', 'ko'),
    (p_project_id, 'start_button', '체크인 시작', 'ko'),
    (p_project_id, 'staff_call_button', '직원 호출', 'ko'),
    (p_project_id, 'personal_info_title', '개인정보 입력', 'ko'),
    (p_project_id, 'phone_label', '대표자 휴대폰 번호', 'ko'),
    (p_project_id, 'email_label', '이메일', 'ko'),
    (p_project_id, 'guest_count_label', '인원 수', 'ko'),
    (p_project_id, 'consent_text', '개인정보 수집 및 이용에 동의합니다', 'ko'),
    (p_project_id, 'id_verification_title', '신분증 확인', 'ko'),
    (p_project_id, 'id_instructions', '신분증을 카메라 중앙에 비춰주세요', 'ko'),
    (p_project_id, 'payment_title', '결제하기', 'ko'),
    (p_project_id, 'complete_title', '체크인이 완료되었습니다', 'ko'),
    (p_project_id, 'room_number_label', '객실 번호', 'ko'),
    (p_project_id, 'checkout_time_label', '체크아웃 시간', 'ko'),
    (p_project_id, 'back_button', '이전', 'ko'),
    (p_project_id, 'next_button', '다음', 'ko'),
    (p_project_id, 'home_button', '처음으로', 'ko')
    ON CONFLICT (project_id, content_key, language) DO NOTHING;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Kiosk Control Commands Table (replaces Supabase Realtime)
-- ============================================
CREATE TABLE IF NOT EXISTS kiosk_control_commands (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    kiosk_id UUID NOT NULL REFERENCES kiosks(id) ON DELETE CASCADE,
    command VARCHAR(50) NOT NULL,
    payload JSONB DEFAULT '{}'::jsonb,
    processed BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kiosk_control_commands_kiosk_id ON kiosk_control_commands(kiosk_id);
CREATE INDEX IF NOT EXISTS idx_kiosk_control_commands_processed ON kiosk_control_commands(processed);

-- ============================================
-- Kiosk Screen Frames Table (for screen streaming)
-- ============================================
CREATE TABLE IF NOT EXISTS kiosk_screen_frames (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    kiosk_id UUID NOT NULL REFERENCES kiosks(id) ON DELETE CASCADE,
    frame_data TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kiosk_screen_frames_kiosk_id ON kiosk_screen_frames(kiosk_id);
CREATE INDEX IF NOT EXISTS idx_kiosk_screen_frames_created_at ON kiosk_screen_frames(created_at);

-- Auto-delete old frames (keep only latest per kiosk)
CREATE OR REPLACE FUNCTION cleanup_old_screen_frames()
RETURNS TRIGGER AS $$
BEGIN
    DELETE FROM kiosk_screen_frames
    WHERE kiosk_id = NEW.kiosk_id
    AND id != NEW.id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS cleanup_screen_frames ON kiosk_screen_frames;
CREATE TRIGGER cleanup_screen_frames
    AFTER INSERT ON kiosk_screen_frames
    FOR EACH ROW EXECUTE FUNCTION cleanup_old_screen_frames();
