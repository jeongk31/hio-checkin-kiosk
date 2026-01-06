import { getCurrentProfile } from '@/lib/auth';
import { execute, queryOne } from '@/lib/db';
import { NextResponse } from 'next/server';

interface Project {
  id: string;
  name: string;
  settings: Record<string, unknown> | null;
}

/**
 * GET project settings
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
      'SELECT id, name, settings FROM projects WHERE id = $1',
      [projectId]
    );

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    return NextResponse.json({
      id: project.id,
      name: project.name,
      settings: project.settings || {},
    });
  } catch (error) {
    console.error('Get project settings error:', error);
    return NextResponse.json({ error: 'Failed to get settings' }, { status: 500 });
  }
}

/**
 * PATCH project settings (partial update)
 */
export async function PATCH(
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

    const updates = await request.json();

    // Get current settings
    const project = await queryOne<Project>(
      'SELECT settings FROM projects WHERE id = $1',
      [projectId]
    );

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Merge with existing settings
    const currentSettings = project.settings || {};
    const newSettings = { ...currentSettings, ...updates };

    // Update project settings
    await execute(
      'UPDATE projects SET settings = $1, updated_at = NOW() WHERE id = $2',
      [JSON.stringify(newSettings), projectId]
    );

    return NextResponse.json({
      success: true,
      settings: newSettings,
    });
  } catch (error) {
    console.error('Update project settings error:', error);
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
  }
}
