import { query, queryOne, execute } from '@/lib/db';
import { getCurrentProfile } from '@/lib/auth';
import { NextResponse } from 'next/server';

interface KioskContent {
  id: string;
  project_id: string;
  content_key: string;
  content_value: string;
  language: string;
  created_at: string;
  updated_at: string;
}

export async function GET(request: Request) {
  try {
    const profile = await getCurrentProfile();

    if (!profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');
    const language = searchParams.get('language') || 'ko';

    if (!projectId) {
      return NextResponse.json({ error: 'Project ID is required' }, { status: 400 });
    }

    // Project admins can only view their own project's content
    if (profile.role === 'project_admin' && projectId !== profile.project_id) {
      return NextResponse.json({ error: 'Cannot view content for other projects' }, { status: 403 });
    }

    const content = await query<KioskContent>(
      'SELECT * FROM kiosk_content WHERE project_id = $1 AND language = $2 ORDER BY content_key',
      [projectId, language]
    );

    return NextResponse.json({ content });
  } catch (error) {
    console.error('Error fetching content:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const profile = await getCurrentProfile();

    if (!profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (profile.role !== 'super_admin' && profile.role !== 'project_admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { projectId, contentKey, contentValue, language = 'ko' } = await request.json();

    // Project admins can only modify their own project's content
    if (profile.role === 'project_admin' && projectId !== profile.project_id) {
      return NextResponse.json({ error: 'Cannot modify content for other projects' }, { status: 403 });
    }

    if (!projectId || !contentKey || !contentValue) {
      return NextResponse.json({ error: 'Project ID, content key, and value are required' }, { status: 400 });
    }

    const data = await queryOne<KioskContent>(`
      INSERT INTO kiosk_content (project_id, content_key, content_value, language)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [projectId, contentKey, contentValue, language]);

    return NextResponse.json({ success: true, content: data });
  } catch (error) {
    console.error('Error creating content:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const profile = await getCurrentProfile();

    if (!profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (profile.role !== 'super_admin' && profile.role !== 'project_admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id, contentValue, projectId } = await request.json();

    // Project admins can only modify their own project's content
    if (profile.role === 'project_admin' && projectId !== profile.project_id) {
      return NextResponse.json({ error: 'Cannot modify content for other projects' }, { status: 403 });
    }

    if (!id || !contentValue) {
      return NextResponse.json({ error: 'ID and content value are required' }, { status: 400 });
    }

    const result = await execute(`
      UPDATE kiosk_content
      SET content_value = $1, updated_at = NOW()
      WHERE id = $2
    `, [contentValue, id]);

    if (result.rowCount === 0) {
      return NextResponse.json({ error: 'Content not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating content:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const profile = await getCurrentProfile();

    if (!profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (profile.role !== 'super_admin' && profile.role !== 'project_admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id, projectId } = await request.json();

    // Project admins can only delete their own project's content
    if (profile.role === 'project_admin' && projectId !== profile.project_id) {
      return NextResponse.json({ error: 'Cannot delete content for other projects' }, { status: 403 });
    }

    if (!id) {
      return NextResponse.json({ error: 'ID is required' }, { status: 400 });
    }

    const result = await execute('DELETE FROM kiosk_content WHERE id = $1', [id]);

    if (result.rowCount === 0) {
      return NextResponse.json({ error: 'Content not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting content:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
