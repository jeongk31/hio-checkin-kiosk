import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getCurrentProfile } from '@/lib/auth';

// GET /api/user-projects?profile_id={id} - Get all projects for a user
export async function GET(request: NextRequest) {
  try {
    const currentProfile = await getCurrentProfile();
    if (!currentProfile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only super admins can view other users' projects
    const searchParams = request.nextUrl.searchParams;
    const profileId = searchParams.get('profile_id');
    
    if (profileId && profileId !== currentProfile.id && currentProfile.role !== 'super_admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const targetProfileId = profileId || currentProfile.id;

    const projects = await query(
      `SELECT p.* 
       FROM projects p
       INNER JOIN user_projects up ON p.id = up.project_id
       WHERE up.profile_id = $1
       ORDER BY p.name`,
      [targetProfileId]
    );

    return NextResponse.json({ projects });
  } catch (error) {
    console.error('[User Projects API] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/user-projects - Assign projects to a user (super admin only)
export async function POST(request: NextRequest) {
  try {
    const currentProfile = await getCurrentProfile();
    if (!currentProfile || currentProfile.role !== 'super_admin') {
      return NextResponse.json({ error: 'Forbidden: Super Admin required' }, { status: 403 });
    }

    const body = await request.json();
    const { profile_id, project_ids } = body;

    if (!profile_id || !Array.isArray(project_ids)) {
      return NextResponse.json({ error: 'profile_id and project_ids array required' }, { status: 400 });
    }

    // Start transaction: delete existing assignments and add new ones
    await query('BEGIN');

    try {
      // Remove all existing project assignments
      await query(
        'DELETE FROM user_projects WHERE profile_id = $1',
        [profile_id]
      );

      // Add new project assignments
      if (project_ids.length > 0) {
        const values = project_ids.map((_, i) => `($1, $${i + 2})`).join(', ');
        const params = [profile_id, ...project_ids];
        
        await query(
          `INSERT INTO user_projects (profile_id, project_id) 
           VALUES ${values}
           ON CONFLICT (profile_id, project_id) DO NOTHING`,
          params
        );
      }

      await query('COMMIT');

      return NextResponse.json({ 
        success: true, 
        message: `Assigned ${project_ids.length} projects to user` 
      });
    } catch (error) {
      await query('ROLLBACK');
      throw error;
    }
  } catch (error) {
    console.error('[User Projects API] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/user-projects?profile_id={id}&project_id={id} - Remove a project from user
export async function DELETE(request: NextRequest) {
  try {
    const currentProfile = await getCurrentProfile();
    if (!currentProfile || currentProfile.role !== 'super_admin') {
      return NextResponse.json({ error: 'Forbidden: Super Admin required' }, { status: 403 });
    }

    const searchParams = request.nextUrl.searchParams;
    const profileId = searchParams.get('profile_id');
    const projectId = searchParams.get('project_id');

    if (!profileId || !projectId) {
      return NextResponse.json({ error: 'profile_id and project_id required' }, { status: 400 });
    }

    await query(
      'DELETE FROM user_projects WHERE profile_id = $1 AND project_id = $2',
      [profileId, projectId]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[User Projects API] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
