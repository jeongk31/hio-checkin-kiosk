import { getCurrentProfile } from '@/lib/auth';
import { query } from '@/lib/db';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

interface Project {
  id: string;
  name: string;
  slug: string;
  region: string | null;
  type: string | null;
  province: string | null;
  location: string | null;
  logo_url: string | null;
  settings: Record<string, unknown> | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * GET /api/projects
 * List all projects (super_admin) or just user's project (project_admin/kiosk)
 */
export async function GET() {
  try {
    const profile = await getCurrentProfile();
    
    console.log('[Projects API] GET request:', {
      role: profile?.role,
      projectId: profile?.project_id,
    });

    if (!profile) {
      console.log('[Projects API] Unauthorized - no profile');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let projects: Project[];

    if (profile.role === 'super_admin') {
      // Super admin can see all projects
      projects = await query<Project>(
        'SELECT * FROM projects WHERE is_active = true ORDER BY name ASC'
      );
      console.log(`[Projects API] Super admin - found ${projects.length} projects`);
    } else if (profile.project_id) {
      // Other users can only see their assigned project
      projects = await query<Project>(
        'SELECT * FROM projects WHERE id = $1 AND is_active = true',
        [profile.project_id]
      );
      console.log(`[Projects API] User project - found ${projects.length} projects for project_id: ${profile.project_id}`);
    } else {
      // User has no project assigned
      console.log('[Projects API] User has no project assigned');
      projects = [];
    }

    return NextResponse.json({ projects });
  } catch (error) {
    console.error('[Projects API] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch projects' }, { status: 500 });
  }
}
