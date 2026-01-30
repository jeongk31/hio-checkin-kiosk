import { query } from '@/lib/db';
import { getCurrentProfile } from '@/lib/auth';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

interface VideoSession {
  id: string;
  kiosk_id: string;
  project_id: string;
  status: string;
  caller_type: string;
}

/**
 * GET /api/video-sessions/status - Check if admin is available for calls
 * Returns: { available: boolean, activeCall: VideoSession | null, waitingCalls: number }
 */
export async function GET(request: Request) {
  try {
    const profile = await getCurrentProfile();

    if (!profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('project_id') || profile.project_id;
    const excludeKioskId = searchParams.get('exclude_kiosk_id');

    if (!projectId) {
      return NextResponse.json({ error: 'project_id is required' }, { status: 400 });
    }

    // First, clean up stale sessions that have been "connected" for more than 10 minutes
    // These are likely zombie sessions from crashed tabs/browsers
    const cleanupStaleConnectedSql = `
      UPDATE video_sessions
      SET status = 'ended', ended_at = NOW()
      WHERE project_id = $1
        AND status = 'connected'
        AND started_at < NOW() - INTERVAL '10 minutes'
        AND ended_at IS NULL
      RETURNING id
    `;
    const cleanedUpConnected = await query<{ id: string }>(cleanupStaleConnectedSql, [projectId]);
    if (cleanedUpConnected.length > 0) {
      console.log('[Status Check] Cleaned up stale connected sessions:', cleanedUpConnected.map(s => s.id));
    }

    // Also clean up stale 'waiting' sessions older than 2 minutes
    // If a kiosk was waiting but closed the browser, the session stays stuck
    const cleanupStaleWaitingSql = `
      UPDATE video_sessions
      SET status = 'ended', ended_at = NOW()
      WHERE project_id = $1
        AND status = 'waiting'
        AND started_at < NOW() - INTERVAL '2 minutes'
        AND ended_at IS NULL
      RETURNING id
    `;
    const cleanedUpWaiting = await query<{ id: string }>(cleanupStaleWaitingSql, [projectId]);
    if (cleanedUpWaiting.length > 0) {
      console.log('[Status Check] Cleaned up stale waiting sessions:', cleanedUpWaiting.map(s => s.id));
    }

    // Check for active calls (connected status) in this project
    // Only consider calls from the last 10 minutes to avoid stale sessions
    // Also exclude sessions that have ended_at timestamp set
    const activeCallSql = `
      SELECT id, kiosk_id, project_id, status, caller_type
      FROM video_sessions
      WHERE project_id = $1
        AND status = 'connected'
        AND started_at > NOW() - INTERVAL '10 minutes'
        AND ended_at IS NULL
      LIMIT 1
    `;
    const activeCalls = await query<VideoSession>(activeCallSql, [projectId]);
    const activeCall = activeCalls[0] || null;

    // Count waiting calls from kiosks (exclude caller's own session)
    // Only consider recent waiting sessions (last 5 minutes)
    let waitingCallsSql = `
      SELECT COUNT(*) as count
      FROM video_sessions
      WHERE project_id = $1
        AND status = 'waiting'
        AND caller_type = 'kiosk'
        AND started_at > NOW() - INTERVAL '5 minutes'
    `;
    const params: unknown[] = [projectId];
    
    if (excludeKioskId) {
      waitingCallsSql += ` AND kiosk_id != $2`;
      params.push(excludeKioskId);
    }
    
    const waitingResult = await query<{ count: string }>(waitingCallsSql, params);
    const waitingCalls = parseInt(waitingResult[0]?.count || '0', 10);

    // Admin is available if there's no active call
    const available = !activeCall;

    const result = {
      available,
      activeCall,
      waitingCalls,
    };

    console.log('[Status Check] Returning:', {
      projectId,
      excludeKioskId,
      available,
      activeCallId: activeCall?.id || null,
      waitingCalls,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error checking call status:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
