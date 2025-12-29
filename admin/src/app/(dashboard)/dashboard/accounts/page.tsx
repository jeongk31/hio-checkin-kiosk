import { getCurrentProfile } from '@/lib/auth';
import { query } from '@/lib/db';
import { redirect } from 'next/navigation';
import AccountList from './AccountList';
import { UserRole } from '@/types/database';

interface ProfileRow {
  id: string;
  user_id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  project_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  project_name?: string;
  project_slug?: string;
  project_logo_url?: string;
  project_is_active?: boolean;
}

export default async function AccountsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');

  const isSuperAdmin = profile.role === 'super_admin';

  // Fetch accounts
  let accounts: ProfileRow[];
  if (isSuperAdmin) {
    accounts = await query<ProfileRow>(
      `SELECT p.*, 
              proj.name as project_name,
              proj.slug as project_slug,
              proj.logo_url as project_logo_url,
              proj.is_active as project_is_active
       FROM profiles p
       LEFT JOIN projects proj ON p.project_id = proj.id
       ORDER BY p.created_at DESC`
    );
  } else {
    accounts = await query<ProfileRow>(
      `SELECT p.*, 
              proj.name as project_name,
              proj.slug as project_slug,
              proj.logo_url as project_logo_url,
              proj.is_active as project_is_active
       FROM profiles p
       LEFT JOIN projects proj ON p.project_id = proj.id
       WHERE p.project_id = $1
       ORDER BY p.created_at DESC`,
      [profile.project_id]
    );
  }

  // Transform to include nested project object
  const transformedAccounts = accounts.map(acc => ({
    id: acc.id,
    user_id: acc.user_id,
    email: acc.email,
    full_name: acc.full_name,
    role: acc.role,
    project_id: acc.project_id,
    is_active: acc.is_active,
    created_at: acc.created_at,
    updated_at: acc.updated_at,
    project: acc.project_id ? {
      id: acc.project_id,
      name: acc.project_name || '',
      slug: acc.project_slug || '',
      logo_url: acc.project_logo_url || null,
      is_active: acc.project_is_active ?? true,
      settings: {},
      created_at: acc.created_at,
      updated_at: acc.updated_at,
    } : undefined,
  }));

  // Fetch projects for super admin filter
  let projects: { id: string; name: string }[] = [];
  if (isSuperAdmin) {
    projects = await query<{ id: string; name: string }>(
      'SELECT id, name FROM projects WHERE is_active = true ORDER BY name'
    );
  }

  return (
    <AccountList
      accounts={transformedAccounts || []}
      projects={projects}
      isSuperAdmin={isSuperAdmin}
      currentUserRole={profile.role}
    />
  );
}
