import { execute, query, queryOne } from '@/lib/db';
import { getCurrentProfile } from '@/lib/auth';
import { NextResponse } from 'next/server';

interface VideoSession {
  id: string;
  kiosk_id: string;
  project_id: string;
  room_name: string;
  status: string;
  caller_type: string;
  staff_user_id: string | null;
  started_at: string | null;
  ended_at: string | null;
  notes: string | null;
}

// GET /api/video-sessions - Get video sessions
export async function GET(request: Request) {
  try {
    const profile = await getCurrentProfile();

    if (!profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const caller_type = searchParams.get('caller_type');
    const project_id = searchParams.get('project_id');
    const kiosk_id = searchParams.get('kiosk_id');

    const whereClauses: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (status) {
      whereClauses.push(`status = $${paramIndex++}`);
      params.push(status);
    }

    if (caller_type) {
      whereClauses.push(`caller_type = $${paramIndex++}`);
      params.push(caller_type);
    }

    if (project_id) {
      whereClauses.push(`project_id = $${paramIndex++}`);
      params.push(project_id);
    }

    if (kiosk_id) {
      whereClauses.push(`kiosk_id = $${paramIndex++}`);
      params.push(kiosk_id);
    }

    // If user is not super_admin, filter by their project_id
    if (profile.role !== 'super_admin' && profile.project_id) {
      whereClauses.push(`project_id = $${paramIndex++}`);
      params.push(profile.project_id);
    }

    const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const sql = `
      SELECT *
      FROM video_sessions
      ${whereClause}
      ORDER BY started_at DESC
    `;

    const sessions = await query<VideoSession>(sql, params);

    return NextResponse.json({ sessions });
  } catch (error) {
    console.error('Error fetching video sessions:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/video-sessions - Create a new video session
export async function POST(request: Request) {
  try {
    const profile = await getCurrentProfile();

    if (!profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { kiosk_id, project_id, room_name, status, caller_type } = await request.json();

    if (!kiosk_id || !project_id || !room_name) {
      return NextResponse.json(
        { error: 'kiosk_id, project_id, and room_name are required' },
        { status: 400 }
      );
    }

    const sql = `
      INSERT INTO video_sessions (kiosk_id, project_id, room_name, status, caller_type)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;

    const session = await queryOne<VideoSession>(sql, [
      kiosk_id,
      project_id,
      room_name,
      status || 'waiting',
      caller_type || 'kiosk',
    ]);

    return NextResponse.json({ session });
  } catch (error) {
    console.error('Error creating video session:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT /api/video-sessions - Update a video session
export async function PUT(request: Request) {
  try {
    const profile = await getCurrentProfile();

    if (!profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id, status, staffUserId, endedAt, started_at, ended_at } = await request.json();

    if (!id) {
      return NextResponse.json({ error: 'Session ID is required' }, { status: 400 });
    }

    const setClauses: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (status !== undefined) {
      setClauses.push(`status = $${paramIndex++}`);
      params.push(status);
    }

    if (staffUserId !== undefined) {
      setClauses.push(`staff_user_id = $${paramIndex++}`);
      params.push(staffUserId);
    }

    // Support both camelCase and snake_case for ended_at
    const endedAtValue = endedAt ?? ended_at;
    if (endedAtValue !== undefined) {
      setClauses.push(`ended_at = $${paramIndex++}`);
      params.push(endedAtValue);
    }

    if (started_at !== undefined) {
      setClauses.push(`started_at = $${paramIndex++}`);
      params.push(started_at);
    }

    if (setClauses.length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    params.push(id);

    const sql = `
      UPDATE video_sessions
      SET ${setClauses.join(', ')}
      WHERE id = $${paramIndex}
    `;

    const result = await execute(sql, params);

    if (result.rowCount === 0) {
      return NextResponse.json({ error: 'Video session not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating video session:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
