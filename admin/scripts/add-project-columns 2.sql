-- Migration: Add missing columns to projects table
-- Run this on your production database to add type, province, and location columns

-- Add type column (업종: 호텔, 펜션, 캠핑, F&B, 기타)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS type VARCHAR(100);

-- Add province column (시/도)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS province VARCHAR(100);

-- Add location column (full location string)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS location VARCHAR(255);

-- Verify the columns were added
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'projects'
ORDER BY ordinal_position;
