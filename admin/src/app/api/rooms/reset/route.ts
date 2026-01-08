import { query, execute } from '@/lib/db';
import { getCurrentProfile } from '@/lib/auth';
import { NextResponse } from 'next/server';
import { getTodayKST } from '@/lib/timezone';

/**
 * POST /api/rooms/reset
 *
 * Daily reset - deletes all rooms and updates reservations
 * - Deletes ALL rooms for the project
 * - Updates all 'checked_in' reservations to 'checked_out'
 *
 * This should be called by a cron job at the configured reset time
 */
export async function POST(request: Request) {
  try {
    const profile = await getCurrentProfile();

    // Allow cron jobs with API key or authenticated admins
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    const isCronJob = cronSecret && authHeader === `Bearer ${cronSecret}`;

    if (!profile && !isCronJob) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (profile && profile.role !== 'super_admin' && profile.role !== 'project_admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { projectId } = await request.json();

    // For cron jobs, projectId is required. For admins, use their project or the provided one.
    const targetProjectId = profile?.role === 'super_admin'
      ? projectId
      : (profile?.project_id || projectId);

    if (!targetProjectId || targetProjectId === 'all') {
      return NextResponse.json({ error: 'Specific Project ID is required for room reset' }, { status: 400 });
    }

    const today = getTodayKST();

    // 1. Count rooms before deletion
    const existingRooms = await query<{ id: string }>(
      'SELECT id FROM rooms WHERE project_id = $1',
      [targetProjectId]
    );

    const roomCount = existingRooms.length;

    // 2. Delete ALL rooms for this project
    const deleteResult = await execute(
      'DELETE FROM rooms WHERE project_id = $1',
      [targetProjectId]
    );

    if (deleteResult.rowCount === null) {
      console.error('Error deleting rooms');
    }

    // 3. Update all checked_in reservations to checked_out
    const checkedOutReservations = await query<{ id: string }>(
      `UPDATE reservations 
       SET status = 'checked_out', updated_at = NOW()
       WHERE project_id = $1 AND status = 'checked_in' AND check_out_date <= $2
       RETURNING id`,
      [targetProjectId, today]
    );

    const checkoutCount = checkedOutReservations.length;

    return NextResponse.json({
      success: true,
      message: `리셋 완료: ${roomCount}개 객실 삭제, ${checkoutCount}개 예약 체크아웃 처리`,
      deletedRooms: roomCount,
      checkedOutReservations: checkoutCount,
    });
  } catch (error) {
    console.error('Error resetting rooms:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
