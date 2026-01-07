import { getCurrentProfile } from '@/lib/auth';
import { queryOne } from '@/lib/db';
import { NextResponse } from 'next/server';

interface Project {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  settings: Record<string, unknown> | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * GET /api/projects/[id]
 * Get a single project by ID
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const profile = await getCurrentProfile();
    if (!profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: projectId } = await params;

    // Check access: super_admin can access any project, others only their own
    if (profile.role !== 'super_admin' && profile.project_id !== projectId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const project = await queryOne<Project>(
      'SELECT * FROM projects WHERE id = $1',
      [projectId]
    );

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    return NextResponse.json({ project });
  } catch (error) {
    console.error('Get project error:', error);
    return NextResponse.json({ error: 'Failed to get project' }, { status: 500 });
  }
}
