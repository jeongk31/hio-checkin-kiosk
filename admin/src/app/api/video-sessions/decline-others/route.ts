import { execute } from '@/lib/db';
import { getCurrentProfile } from '@/lib/auth';
import { NextResponse } from 'next/server';

/**
 * POST /api/video-sessions/decline-others
 * When admin answers a call, decline all other waiting sessions from the same project
 * This notifies other kiosks that admin is now busy
 */
export async function POST(request: Request) {
  try {
    const profile = await getCurrentProfile();

    if (!profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only admins can decline sessions
    const ADMIN_ROLES = ['super_admin', 'project_admin', 'manager'];
    if (!ADMIN_ROLES.includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { answeredSessionId, projectId } = await request.json();

    if (!answeredSessionId) {
      return NextResponse.json({ error: 'answeredSessionId is required' }, { status: 400 });
    }

    const targetProjectId = projectId || profile.project_id;

    // Update all waiting kiosk sessions except the answered one
    const sql = `
      UPDATE video_sessions
      SET status = 'ended', 
          ended_at = NOW()
      WHERE status = 'waiting'
        AND caller_type = 'kiosk'
        AND id != $1
        ${targetProjectId ? 'AND project_id = $2' : ''}
    `;

    const params = targetProjectId 
      ? [answeredSessionId, targetProjectId]
      : [answeredSessionId];

    const result = await execute(sql, params);

    console.log(`[decline-others] Declined ${result.rowCount} other waiting sessions`);

    return NextResponse.json({ 
      success: true, 
      declinedCount: result.rowCount 
    });
  } catch (error) {
    console.error('Error declining other sessions:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
