import { NextRequest, NextResponse } from 'next/server';
import { execute, queryOne } from '@/lib/db';
import { getCurrentProfile } from '@/lib/auth';

interface ScreenFrameRow {
  id: string;
  kiosk_id: string;
  frame_data: string;
  created_at: string;
}

// POST - Upload a new screen frame (from kiosk)
export async function POST(request: NextRequest) {
  try {
    const profile = await getCurrentProfile();
    if (!profile || profile.role !== 'kiosk') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get the kiosk associated with this profile
    const kiosk = await queryOne<{ id: string }>(
      'SELECT id FROM kiosks WHERE profile_id = $1',
      [profile.id]
    );

    if (!kiosk) {
      return NextResponse.json({ error: 'Kiosk not found' }, { status: 404 });
    }

    const { frameData } = await request.json();

    if (!frameData) {
      return NextResponse.json({ error: 'Missing frameData' }, { status: 400 });
    }

    // Insert new frame (trigger will auto-cleanup old frames)
    await execute(
      `INSERT INTO kiosk_screen_frames (kiosk_id, frame_data)
       VALUES ($1, $2)`,
      [kiosk.id, frameData]
    );

    // Update kiosk status and last_seen
    await execute(
      `UPDATE kiosks SET status = 'online', last_seen = NOW() WHERE id = $1`,
      [kiosk.id]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error uploading screen frame:', error);
    return NextResponse.json({ error: 'Failed to upload frame' }, { status: 500 });
  }
}

// GET - Get latest screen frame for a kiosk (for admin monitoring)
export async function GET(request: NextRequest) {
  try {
    const profile = await getCurrentProfile();
    if (!profile || (profile.role !== 'super_admin' && profile.role !== 'project_admin')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const kioskId = searchParams.get('kioskId');

    if (!kioskId) {
      return NextResponse.json({ error: 'Missing kioskId' }, { status: 400 });
    }

    // Verify access to this kiosk
    if (profile.role !== 'super_admin') {
      const kiosk = await queryOne<{ project_id: string }>(
        'SELECT project_id FROM kiosks WHERE id = $1',
        [kioskId]
      );
      if (!kiosk || kiosk.project_id !== profile.project_id) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      }
    }

    // Get latest frame
    const frame = await queryOne<ScreenFrameRow>(
      `SELECT * FROM kiosk_screen_frames
       WHERE kiosk_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [kioskId]
    );

    // Return in format expected by dashboard: { frame: { id, image_data } }
    if (frame) {
      return NextResponse.json({
        frame: {
          id: frame.id,
          image_data: frame.frame_data
        }
      });
    }
    return NextResponse.json({ frame: null });
  } catch (error) {
    console.error('Error getting screen frame:', error);
    return NextResponse.json({ error: 'Failed to get frame' }, { status: 500 });
  }
}
