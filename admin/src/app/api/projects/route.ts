import { query } from '@/lib/db';
import { getCurrentProfile } from '@/lib/auth';
import { NextResponse } from 'next/server';
import { Project } from '@/types/database';

export async function GET() {
  try {
    const profile = await getCurrentProfile();

    if (!profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let projects: Project[];

    // Super admins can see all projects, others can only see their own
    if (profile.role === 'super_admin') {
      projects = await query<Project>(
        'SELECT * FROM projects WHERE is_active = true ORDER BY name'
      );
    } else if (profile.project_id) {
      projects = await query<Project>(
        'SELECT * FROM projects WHERE id = $1',
        [profile.project_id]
      );
    } else {
      projects = [];
    }

    return NextResponse.json({ projects });
  } catch (error) {
    console.error('Error fetching projects:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
