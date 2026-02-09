import { query, queryOne } from '@/lib/db';
import { getCurrentProfile } from '@/lib/auth';
import { NextResponse } from 'next/server';

// POST /api/rooms/change - Change a checked-in guest to a different room
export async function POST(request: Request) {
  try {
    const profile = await getCurrentProfile();

    if (!profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only admins can change rooms
    if (profile.role !== 'super_admin' && profile.role !== 'project_admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { currentRoomId, newRoomId } = await request.json();

    if (!currentRoomId || !newRoomId) {
      return NextResponse.json({ error: 'currentRoomId and newRoomId are required' }, { status: 400 });
    }

    const targetProjectId = profile.project_id;

    // Get the current room
    const currentRoom = await queryOne<{ id: string; room_number: string; project_id: string; status: string }>(
      'SELECT id, room_number, project_id, status FROM rooms WHERE id = $1',
      [currentRoomId]
    );

    if (!currentRoom) {
      return NextResponse.json({ error: 'Current room not found' }, { status: 404 });
    }

    // Authorization check
    if (profile.role !== 'super_admin' && currentRoom.project_id !== targetProjectId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (currentRoom.status !== 'occupied') {
      return NextResponse.json({ error: 'Current room is not occupied' }, { status: 400 });
    }

    // Get the new room
    const newRoom = await queryOne<{ id: string; room_number: string; project_id: string; status: string }>(
      'SELECT id, room_number, project_id, status FROM rooms WHERE id = $1',
      [newRoomId]
    );

    if (!newRoom) {
      return NextResponse.json({ error: 'New room not found' }, { status: 404 });
    }

    if (newRoom.project_id !== currentRoom.project_id) {
      return NextResponse.json({ error: 'Rooms must be in the same project' }, { status: 400 });
    }

    if (newRoom.status !== 'available') {
      return NextResponse.json({ error: 'New room is not available' }, { status: 400 });
    }

    // Update reservation: change room_number from current to new
    await query(
      `UPDATE reservations SET room_number = $1, updated_at = NOW()
       WHERE project_id = $2 AND room_number = $3 AND status = 'checked_in'`,
      [newRoom.room_number, currentRoom.project_id, currentRoom.room_number]
    );

    // Update current room: set back to available
    await query(
      `UPDATE rooms SET status = 'available', updated_at = NOW() WHERE id = $1`,
      [currentRoomId]
    );

    // Update new room: set to occupied
    await query(
      `UPDATE rooms SET status = 'occupied', updated_at = NOW() WHERE id = $1`,
      [newRoomId]
    );

    return NextResponse.json({
      success: true,
      fromRoom: currentRoom.room_number,
      toRoom: newRoom.room_number,
    });
  } catch (error) {
    console.error('Error changing room:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
