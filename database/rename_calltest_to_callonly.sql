-- Migration: Rename 'call_test' role to 'call_only'
-- Date: 2026-01-22

-- Step 1: Create new enum type with 'call_only' instead of 'call_test'
ALTER TYPE user_role RENAME TO user_role_old;

CREATE TYPE user_role AS ENUM ('super_admin', 'project_admin', 'kiosk', 'call_only');

-- Step 2: Update profiles table to use new enum, converting call_test -> call_only
ALTER TABLE profiles 
  ALTER COLUMN role DROP DEFAULT;

ALTER TABLE profiles 
  ALTER COLUMN role TYPE user_role 
  USING CASE 
    WHEN role::text = 'call_test' THEN 'call_only'::user_role
    ELSE role::text::user_role
  END;

-- Step 3: Drop the old enum
DROP TYPE user_role_old;

-- Verification
SELECT 'Migration complete. Current roles:' as status;
SELECT role, COUNT(*) as count FROM profiles GROUP BY role;
