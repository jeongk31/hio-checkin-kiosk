import { queryOne, query } from '@/lib/db';
import { getCurrentUserId } from '@/lib/db/auth';
import { Profile, Project } from '@/types/database';

interface ProfileRow {
  id: string;
  user_id: string;
  email: string;
  full_name: string | null;
  role: string;
  project_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  project_name?: string;
  project_slug?: string;
  project_logo_url?: string;
  project_settings?: Record<string, unknown>;
  project_is_active?: boolean;
  project_created_at?: string;
  project_updated_at?: string;
}

export async function getCurrentUser(): Promise<{ id: string } | null> {
  const userId = await getCurrentUserId();
  if (!userId) return null;
  return { id: userId };
}

export async function getCurrentProfile(): Promise<Profile | null> {
  const userId = await getCurrentUserId();

  if (!userId) return null;

  const row = await queryOne<ProfileRow>(
    `SELECT 
      p.*,
      proj.name as project_name,
      proj.slug as project_slug,
      proj.logo_url as project_logo_url,
      proj.settings as project_settings,
      proj.is_active as project_is_active,
      proj.created_at as project_created_at,
      proj.updated_at as project_updated_at
    FROM profiles p
    LEFT JOIN projects proj ON p.project_id = proj.id
    WHERE p.user_id = $1`,
    [userId]
  );

  if (!row) return null;

  // Transform to match the Profile type with nested project
  const profile: Profile = {
    id: row.id,
    user_id: row.user_id,
    email: row.email,
    full_name: row.full_name,
    role: row.role as 'super_admin' | 'project_admin' | 'kiosk',
    project_id: row.project_id,
    is_active: row.is_active,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };

  // Add project if exists
  if (row.project_id && row.project_name) {
    profile.project = {
      id: row.project_id,
      name: row.project_name,
      slug: row.project_slug || '',
      logo_url: row.project_logo_url || null,
      settings: row.project_settings || {},
      is_active: row.project_is_active ?? true,
      created_at: row.project_created_at || row.created_at,
      updated_at: row.project_updated_at || row.updated_at,
    };
  }

  // Fetch all projects for team leaders (multi-project support)
  if (row.role === 'project_admin') {
    const projectRows = await query<Project>(
      `SELECT p.* 
       FROM projects p
       INNER JOIN user_projects up ON p.id = up.project_id
       WHERE up.profile_id = $1
       ORDER BY p.name`,
      [row.id]
    );
    
    if (projectRows && projectRows.length > 0) {
      profile.projects = projectRows;
      
      // If no legacy project_id, set it to first project for backward compatibility
      if (!profile.project_id && projectRows[0]) {
        profile.project = projectRows[0];
      }
    }
  }

  return profile;
}

export async function requireAuth(): Promise<Profile> {
  const profile = await getCurrentProfile();
  if (!profile) {
    throw new Error('Unauthorized');
  }
  return profile;
}

export async function requireSuperAdmin(): Promise<Profile> {
  const profile = await requireAuth();
  if (profile.role !== 'super_admin') {
    throw new Error('Forbidden: Super Admin access required');
  }
  return profile;
}

export async function requireProjectAdmin(): Promise<Profile> {
  const profile = await requireAuth();
  if (profile.role !== 'super_admin' && profile.role !== 'project_admin') {
    throw new Error('Forbidden: Project Admin access required');
  }
  return profile;
}
