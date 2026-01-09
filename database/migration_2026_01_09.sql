-- Migration for 2026-01-09 updates
-- Run this on the kiosk database

-- 1. Add paid_amount column to reservations (if not exists)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'reservations' AND column_name = 'paid_amount'
    ) THEN
        ALTER TABLE reservations ADD COLUMN paid_amount INTEGER DEFAULT 0;
        RAISE NOTICE 'Added paid_amount column to reservations';
    ELSE
        RAISE NOTICE 'paid_amount column already exists';
    END IF;
END $$;

-- 2. Add call_test to user_role ENUM (if not exists)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumlabel = 'call_test' 
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'user_role')
    ) THEN
        ALTER TYPE user_role ADD VALUE 'call_test';
        RAISE NOTICE 'Added call_test to user_role enum';
    ELSE
        RAISE NOTICE 'call_test already exists in user_role enum';
    END IF;
END $$;

-- 3. Create amenities table (if not exists)
CREATE TABLE IF NOT EXISTS amenities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    price INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(project_id, name)
);

-- 4. Create indexes for amenities (if not exists)
CREATE INDEX IF NOT EXISTS idx_amenities_project_id ON amenities(project_id);
CREATE INDEX IF NOT EXISTS idx_amenities_is_active ON amenities(is_active);

-- 5. Create trigger for amenities updated_at (if not exists)
DROP TRIGGER IF EXISTS update_amenities_updated_at ON amenities;
CREATE TRIGGER update_amenities_updated_at
    BEFORE UPDATE ON amenities
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Done
SELECT 'Migration completed successfully!' AS status;
