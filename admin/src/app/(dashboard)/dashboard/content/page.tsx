import { getCurrentProfile } from '@/lib/auth';
import { query } from '@/lib/db';
import { redirect } from 'next/navigation';
import ContentEditor from './ContentEditor';

interface ProjectRow {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  is_active: boolean;
}

interface ContentRow {
  id: string;
  project_id: string;
  content_key: string;
  content_value: string;
  language: string;
  created_at: string;
  updated_at: string;
}

export default async function ContentPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');

  // Only project admins and super admins with a project can edit content
  const projectId = profile.project_id;
  if (!projectId && profile.role !== 'super_admin') {
    redirect('/dashboard');
  }

  // For super admin, get all projects to select from
  let projects: ProjectRow[] | null = null;
  if (profile.role === 'super_admin') {
    projects = await query<ProjectRow>(
      'SELECT * FROM projects WHERE is_active = true ORDER BY name'
    );
  }

  // Get content for the current project (or first project for super admin)
  let content: ContentRow[] | null = null;
  const targetProjectId = projectId || projects?.[0]?.id;

  if (targetProjectId) {
    content = await query<ContentRow>(
      'SELECT * FROM kiosk_content WHERE project_id = $1 ORDER BY content_key',
      [targetProjectId]
    );
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-8">콘텐츠 편집</h1>

      <ContentEditor
        initialContent={content || []}
        projects={projects}
        defaultProjectId={targetProjectId || null}
        isSuperAdmin={profile.role === 'super_admin'}
      />
    </div>
  );
}
