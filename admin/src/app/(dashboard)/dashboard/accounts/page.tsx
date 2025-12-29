import { getCurrentProfile } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import AccountList from './AccountList';

export default async function AccountsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');

  const supabase = await createServiceClient();
  const isSuperAdmin = profile.role === 'super_admin';

  // Fetch accounts
  let accountsQuery = supabase
    .from('profiles')
    .select('*, project:projects(*)')
    .order('created_at', { ascending: false });

  // Project admins can only see accounts in their project
  if (!isSuperAdmin) {
    accountsQuery = accountsQuery.eq('project_id', profile.project_id);
  }

  const { data: accounts } = await accountsQuery;

  // Fetch projects for super admin filter
  let projects: { id: string; name: string }[] = [];
  if (isSuperAdmin) {
    const { data: projectsData } = await supabase
      .from('projects')
      .select('id, name')
      .eq('is_active', true)
      .order('name');
    projects = projectsData || [];
  }

  return (
    <AccountList
      accounts={accounts || []}
      projects={projects}
      isSuperAdmin={isSuperAdmin}
      currentUserRole={profile.role}
    />
  );
}
