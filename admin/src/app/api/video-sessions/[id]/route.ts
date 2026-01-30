import { queryOne } from '@/lib/db';
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

// GET /api/video-sessions/[id] - Get a single video session by ID
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const profile = await getCurrentProfile();

    if (!profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: 'Session ID is required' }, { status: 400 });
    }

    let sql = `SELECT * FROM video_sessions WHERE id = $1`;
    const queryParams: unknown[] = [id];

    // If user is not super_admin, filter by their project_id
    if (profile.role !== 'super_admin' && profile.project_id) {
      sql += ` AND project_id = $2`;
      queryParams.push(profile.project_id);
    }

    const session = await queryOne<VideoSession>(sql, queryParams);

    if (!session) {
      return NextResponse.json({ error: 'Video session not found' }, { status: 404 });
    }

    return NextResponse.json({ session });
  } catch (error) {
    console.error('Error fetching video session:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
