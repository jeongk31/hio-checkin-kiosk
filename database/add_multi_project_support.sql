-- Migration: Add multi-project support for Team Leaders
-- Date: 2026-01-22
-- This allows team leaders to manage multiple projects

-- Step 1: Create user_projects junction table
CREATE TABLE IF NOT EXISTS user_projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(profile_id, project_id)
);

CREATE INDEX idx_user_projects_profile_id ON user_projects(profile_id);
CREATE INDEX idx_user_projects_project_id ON user_projects(project_id);

-- Step 2: Migrate existing single project assignments to junction table
-- For users with project_id set, create corresponding entry in user_projects
INSERT INTO user_projects (profile_id, project_id)
SELECT id, project_id
FROM profiles
WHERE project_id IS NOT NULL
ON CONFLICT (profile_id, project_id) DO NOTHING;

-- Step 3: Add comment for documentation
COMMENT ON TABLE user_projects IS 'Many-to-many relationship between users and projects. Allows team leaders to manage multiple projects.';
COMMENT ON COLUMN profiles.project_id IS 'DEPRECATED: Single project assignment. Use user_projects table instead for team leaders.';

-- Verification
SELECT 'Migration complete. Summary:' as status;
SELECT 
  p.email,
  p.role,
  p.project_id as legacy_project,
  COUNT(up.project_id) as assigned_projects
FROM profiles p
LEFT JOIN user_projects up ON p.id = up.profile_id
GROUP BY p.id, p.email, p.role, p.project_id
HAVING COUNT(up.project_id) > 0
ORDER BY p.role, p.email;
