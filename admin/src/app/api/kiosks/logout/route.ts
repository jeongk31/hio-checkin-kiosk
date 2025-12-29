import { queryOne, execute } from '@/lib/db';
import { getCurrentProfile } from '@/lib/auth';
import { NextResponse } from 'next/server';

interface Kiosk {
  id: string;
  project_id: string;
  profile_id: string | null;
}

export async function POST(request: Request) {
  try {
    const profile = await getCurrentProfile();

    if (!profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only super admins and project admins can logout kiosks
    if (profile.role !== 'super_admin' && profile.role !== 'project_admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { kioskId } = await request.json();

    if (!kioskId) {
      return NextResponse.json({ error: 'Kiosk ID is required' }, { status: 400 });
    }

    // Get the kiosk to verify permissions
    const kiosk = await queryOne<Kiosk>(
      'SELECT id, project_id, profile_id FROM kiosks WHERE id = $1',
      [kioskId]
    );

    if (!kiosk) {
      return NextResponse.json({ error: 'Kiosk not found' }, { status: 404 });
    }

    // Project admins can only logout kiosks from their own project
    if (profile.role === 'project_admin' && kiosk.project_id !== profile.project_id) {
      return NextResponse.json({ error: 'Cannot logout kiosks from other projects' }, { status: 403 });
    }

    // Update kiosk status to offline
    // The kiosk will detect this status change through polling
    await execute(
      `UPDATE kiosks 
       SET status = 'offline', last_seen = NOW()
       WHERE id = $1`,
      [kioskId]
    );

    // If the kiosk has an associated profile, sign them out by deleting their session
    if (kiosk.profile_id) {
      await execute(
        'DELETE FROM sessions WHERE user_id IN (SELECT user_id FROM profiles WHERE id = $1)',
        [kiosk.profile_id]
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error logging out kiosk:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
