import { query, queryOne } from '@/lib/db';
import { getCurrentProfile } from '@/lib/auth';
import { NextResponse } from 'next/server';

interface RoomType {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  base_price: number;
  max_guests: number;
  is_active: boolean;
  display_order: number;
  image_url: string | null;
}

interface Room {
  id: string;
  project_id: string;
  room_type_id: string;
  room_number: string;
  floor: string | null;
  status: string;
  is_active: boolean;
  room_type?: RoomType;
  dailyStatus?: boolean;
}

interface RoomDailyStatus {
  id: string;
  room_id: string;
  project_id: string;
  date: string;
  is_available: boolean;
  created_at: string;
  updated_at: string;
}

// Get room daily status for a specific date
export async function GET(request: Request) {
  try {
    const profile = await getCurrentProfile();

    if (!profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');
    const date = searchParams.get('date');

    if (!date) {
      return NextResponse.json({ error: 'Date is required' }, { status: 400 });
    }

    const targetProjectId = profile.role === 'super_admin' ? projectId : profile.project_id;

    if (!targetProjectId) {
      return NextResponse.json({ error: 'Project ID is required' }, { status: 400 });
    }

    // Get all rooms with their room type for the given project
    const rooms = await query<Room>(
      `SELECT 
        r.*,
        row_to_json(rt.*) as room_type
       FROM rooms r
       LEFT JOIN room_types rt ON r.room_type_id = rt.id
       WHERE r.project_id = $1 AND r.is_active = true
       ORDER BY r.room_number`,
      [targetProjectId]
    );

    // Get daily status for the date
    const statusData = await query<{ room_id: string; is_available: boolean }>(
      'SELECT room_id, is_available FROM room_daily_status WHERE project_id = $1 AND date = $2',
      [targetProjectId, date]
    );

    // Create a map of room_id -> status
    const statusMap: Record<string, boolean> = {};
    statusData.forEach((status) => {
      statusMap[status.room_id] = status.is_available;
    });

    // Combine rooms with their status
    const roomsWithStatus = rooms.map((room) => ({
      ...room,
      dailyStatus: statusMap[room.id] ?? false, // Default to not available
    }));

    return NextResponse.json({ rooms: roomsWithStatus });
  } catch (error) {
    console.error('Error fetching room daily status:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Update room daily status (upsert)
export async function POST(request: Request) {
  try {
    const profile = await getCurrentProfile();

    if (!profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (profile.role !== 'super_admin' && profile.role !== 'project_admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { projectId, roomId, date, isAvailable } = await request.json();

    const targetProjectId = profile.role === 'super_admin' ? projectId : profile.project_id;

    if (!targetProjectId || !roomId || !date) {
      return NextResponse.json({ error: 'Project ID, room ID, and date are required' }, { status: 400 });
    }

    const data = await queryOne<RoomDailyStatus>(
      `INSERT INTO room_daily_status (room_id, project_id, date, is_available)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (room_id, date) DO UPDATE SET
         is_available = EXCLUDED.is_available,
         updated_at = NOW()
       RETURNING *`,
      [roomId, targetProjectId, date, isAvailable]
    );

    return NextResponse.json({ success: true, status: data });
  } catch (error) {
    console.error('Error updating room daily status:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Bulk update room daily status
export async function PATCH(request: Request) {
  try {
    const profile = await getCurrentProfile();

    if (!profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (profile.role !== 'super_admin' && profile.role !== 'project_admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { projectId, updates } = await request.json();
    // updates is an array of { roomId, date, isAvailable }

    const targetProjectId = profile.role === 'super_admin' ? projectId : profile.project_id;

    if (!targetProjectId || !updates || !Array.isArray(updates)) {
      return NextResponse.json({ error: 'Project ID and updates array are required' }, { status: 400 });
    }

    // Build bulk upsert query
    const values: unknown[] = [];
    const valueRows: string[] = [];
    let paramIndex = 1;

    for (const u of updates as { roomId: string; date: string; isAvailable: boolean }[]) {
      valueRows.push(`($${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++})`);
      values.push(u.roomId, targetProjectId, u.date, u.isAvailable);
    }

    const sql = `
      INSERT INTO room_daily_status (room_id, project_id, date, is_available)
      VALUES ${valueRows.join(', ')}
      ON CONFLICT (room_id, date) DO UPDATE SET
        is_available = EXCLUDED.is_available,
        updated_at = NOW()
      RETURNING *
    `;

    const data = await query<RoomDailyStatus>(sql, values);

    return NextResponse.json({ success: true, statuses: data });
  } catch (error) {
    console.error('Error bulk updating room daily status:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
