-- Kiosk Admin Database Schema
-- Run this file to set up all required tables

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Sessions table
CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    token TEXT NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Projects table
CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE,
    logo_url TEXT,
    settings JSONB DEFAULT '{}',
    region VARCHAR(100),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Profiles table
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    full_name VARCHAR(255),
    role VARCHAR(50) DEFAULT 'kiosk',
    project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Room Types table
CREATE TABLE IF NOT EXISTS room_types (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    base_price DECIMAL(10, 2),
    max_guests INTEGER,
    display_order INTEGER DEFAULT 0,
    images JSONB DEFAULT '[]',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Rooms table
CREATE TABLE IF NOT EXISTS rooms (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    room_type_id UUID REFERENCES room_types(id) ON DELETE SET NULL,
    room_number VARCHAR(50) NOT NULL,
    access_type VARCHAR(50),
    room_password VARCHAR(255),
    key_box_number VARCHAR(50),
    key_box_password VARCHAR(255),
    floor VARCHAR(50),
    notes TEXT,
    status VARCHAR(50) DEFAULT 'available',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Guests table
CREATE TABLE IF NOT EXISTS guests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    first_name VARCHAR(255),
    last_name VARCHAR(255),
    phone_number VARCHAR(50),
    email VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Channels table
CREATE TABLE IF NOT EXISTS channels (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    code VARCHAR(50),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Reservations table
CREATE TABLE IF NOT EXISTS reservations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    room_type_id UUID REFERENCES room_types(id) ON DELETE SET NULL,
    room_id UUID REFERENCES rooms(id) ON DELETE SET NULL,
    guest_id UUID REFERENCES guests(id) ON DELETE SET NULL,
    reservation_number VARCHAR(100),
    guest_name VARCHAR(255),
    guest_phone VARCHAR(50),
    guest_email VARCHAR(255),
    guest_count INTEGER DEFAULT 1,
    check_in_date DATE,
    check_out_date DATE,
    room_number VARCHAR(50),
    source VARCHAR(100),
    channel_id UUID REFERENCES channels(id) ON DELETE SET NULL,
    status VARCHAR(50) DEFAULT 'pending',
    verification_data JSONB,
    verified_guests JSONB DEFAULT '[]',
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Kiosks table
CREATE TABLE IF NOT EXISTS kiosks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,
    location VARCHAR(255),
    status VARCHAR(50) DEFAULT 'offline',
    current_screen VARCHAR(100) DEFAULT 'idle',
    current_session_id UUID,
    last_seen TIMESTAMP WITH TIME ZONE,
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Kiosk Content table
CREATE TABLE IF NOT EXISTS kiosk_content (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    content_key VARCHAR(255) NOT NULL,
    content_value TEXT,
    language VARCHAR(10) DEFAULT 'ko',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Video Sessions table
CREATE TABLE IF NOT EXISTS video_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    kiosk_id UUID REFERENCES kiosks(id) ON DELETE CASCADE,
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    staff_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    room_name VARCHAR(255),
    status VARCHAR(50) DEFAULT 'waiting',
    caller_type VARCHAR(50) DEFAULT 'kiosk',
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ended_at TIMESTAMP WITH TIME ZONE,
    notes TEXT
);

-- Checkin Sessions table
CREATE TABLE IF NOT EXISTS checkin_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    kiosk_id UUID REFERENCES kiosks(id) ON DELETE CASCADE,
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    reservation_id UUID REFERENCES reservations(id) ON DELETE SET NULL,
    guest_phone VARCHAR(50),
    guest_email VARCHAR(255),
    guest_count INTEGER,
    room_number VARCHAR(50),
    status VARCHAR(50) DEFAULT 'in_progress',
    current_step VARCHAR(100),
    data JSONB DEFAULT '{}',
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE
);

-- Payments table
CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    reservation_id UUID REFERENCES reservations(id) ON DELETE SET NULL,
    kiosk_id UUID REFERENCES kiosks(id) ON DELETE SET NULL,
    amount DECIMAL(10, 2),
    currency VARCHAR(10) DEFAULT 'KRW',
    status VARCHAR(50),
    payment_method VARCHAR(50),
    transaction_id VARCHAR(255),
    payment_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Identity Verifications table
CREATE TABLE IF NOT EXISTS identity_verifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reservation_id UUID REFERENCES reservations(id) ON DELETE CASCADE,
    kiosk_id UUID REFERENCES kiosks(id) ON DELETE SET NULL,
    guest_name VARCHAR(255),
    id_type VARCHAR(50),
    id_number VARCHAR(255),
    verification_status VARCHAR(50),
    verification_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Room Availability table
CREATE TABLE IF NOT EXISTS room_availability (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    room_type_id UUID REFERENCES room_types(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    total_rooms INTEGER,
    available_rooms INTEGER,
    price_override DECIMAL(10, 2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Room Daily Status table
CREATE TABLE IF NOT EXISTS room_daily_status (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    is_available BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Kiosk Control Commands table
CREATE TABLE IF NOT EXISTS kiosk_control_commands (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    kiosk_id UUID REFERENCES kiosks(id) ON DELETE CASCADE,
    command VARCHAR(100) NOT NULL,
    payload JSONB,
    processed BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Kiosk Screen Frames table
CREATE TABLE IF NOT EXISTS kiosk_screen_frames (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    kiosk_id UUID REFERENCES kiosks(id) ON DELETE CASCADE,
    frame_data TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Signaling Messages table
CREATE TABLE IF NOT EXISTS signaling_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id VARCHAR(255) NOT NULL,
    payload JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_project_id ON profiles(project_id);
CREATE INDEX IF NOT EXISTS idx_kiosks_project_id ON kiosks(project_id);
CREATE INDEX IF NOT EXISTS idx_kiosks_profile_id ON kiosks(profile_id);
CREATE INDEX IF NOT EXISTS idx_reservations_project_id ON reservations(project_id);
CREATE INDEX IF NOT EXISTS idx_reservations_check_in_date ON reservations(check_in_date);
CREATE INDEX IF NOT EXISTS idx_rooms_project_id ON rooms(project_id);
CREATE INDEX IF NOT EXISTS idx_room_types_project_id ON room_types(project_id);
CREATE INDEX IF NOT EXISTS idx_kiosk_content_project_id ON kiosk_content(project_id);

-- Success message
SELECT 'Database schema created successfully!' as message;
