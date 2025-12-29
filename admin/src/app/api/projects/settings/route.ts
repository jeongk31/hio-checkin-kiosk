import { query, queryOne } from '@/lib/db';
import { getCurrentProfile } from '@/lib/auth';
import { NextResponse } from 'next/server';

interface Project {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  settings: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

// Update project settings (like daily reset time)
export async function PUT(request: Request) {
  try {
    const profile = await getCurrentProfile();

    if (!profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (profile.role !== 'super_admin' && profile.role !== 'project_admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { projectId, settings } = await request.json();

    const targetProjectId = profile.role === 'super_admin' ? projectId : profile.project_id;

    if (!targetProjectId || targetProjectId === 'all') {
      return NextResponse.json({ error: 'Specific Project ID is required' }, { status: 400 });
    }

    // Project admins can only update their own project
    if (profile.role === 'project_admin' && projectId && projectId !== profile.project_id) {
      return NextResponse.json({ error: 'Cannot update settings for other projects' }, { status: 403 });
    }

    // Get current settings
    const currentProject = await queryOne<{ settings: Record<string, unknown> | null }>(
      'SELECT settings FROM projects WHERE id = $1',
      [targetProjectId]
    );

    if (!currentProject) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Merge settings
    const mergedSettings = {
      ...(currentProject.settings || {}),
      ...settings,
    };

    const updatedProjects = await query<Project>(
      `UPDATE projects 
       SET settings = $1, updated_at = NOW() 
       WHERE id = $2 
       RETURNING *`,
      [JSON.stringify(mergedSettings), targetProjectId]
    );

    if (updatedProjects.length === 0) {
      return NextResponse.json({ error: 'Failed to update project' }, { status: 400 });
    }

    return NextResponse.json({ success: true, project: updatedProjects[0] });
  } catch (error) {
    console.error('Error updating project settings:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
