import { getCurrentProfile } from '@/lib/auth';
import { query } from '@/lib/db';
import { redirect } from 'next/navigation';
import KioskManagement from './KioskManagement';
import { KioskStatus, Profile } from '@/types/database';

interface ProjectRow {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  is_active: boolean;
  settings: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

interface KioskRow {
  id: string;
  name: string;
  project_id: string;
  profile_id: string | null;
  location: string | null;
  status: KioskStatus;
  current_screen: string;
  current_session_id: string | null;
  last_seen: string | null;
  settings: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  project: ProjectRow | null;
  profile: Profile | null;
}

interface KioskContentRow {
  id: string;
  project_id: string;
  content_key: string;
  content_value: string | null;
  language: string;
  created_at: string;
  updated_at: string;
}

export default async function KiosksPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');

  const isSuperAdmin = profile.role === 'super_admin';

  // Get all projects (for super admin) or just the user's project
  const projectsSQL = `
    SELECT * FROM projects 
    WHERE is_active = true
    ${!isSuperAdmin && profile.project_id ? 'AND id = $1' : ''}
    ORDER BY name
  `;
  const projects = await query<ProjectRow>(
    projectsSQL,
    !isSuperAdmin && profile.project_id ? [profile.project_id] : []
  );

  // Get all kiosks with their project info (only kiosks linked to kiosk role profiles)
  const kiosksSQL = `
    SELECT
      k.*,
      json_build_object(
        'id', p.id,
        'name', p.name,
        'slug', p.slug,
        'logo_url', p.logo_url,
        'is_active', p.is_active,
        'settings', p.settings,
        'created_at', p.created_at,
        'updated_at', p.updated_at
      ) as project,
      json_build_object(
        'id', pr.id,
        'name', pr.full_name,
        'email', pr.email,
        'role', pr.role
      ) as profile
    FROM kiosks k
    LEFT JOIN projects p ON k.project_id = p.id
    INNER JOIN profiles pr ON k.profile_id = pr.id AND pr.role = 'kiosk'
    ${!isSuperAdmin && profile.project_id ? 'WHERE k.project_id = $1' : ''}
    ORDER BY k.created_at DESC
  `;
  const kiosks = await query<KioskRow>(
    kiosksSQL,
    !isSuperAdmin && profile.project_id ? [profile.project_id] : []
  );

  // Get content for all relevant projects
  const contentSQL = `
    SELECT * FROM kiosk_content
    ${!isSuperAdmin && profile.project_id ? 'WHERE project_id = $1' : ''}
    ORDER BY content_key
  `;
  const content = await query<KioskContentRow>(
    contentSQL,
    !isSuperAdmin && profile.project_id ? [profile.project_id] : []
  );

  return (
    <KioskManagement
      projects={projects || []}
      kiosks={kiosks || []}
      content={content || []}
      isSuperAdmin={isSuperAdmin}
      currentProjectId={profile.project_id}
    />
  );
}
