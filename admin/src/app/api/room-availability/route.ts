import { query, queryOne, execute } from '@/lib/db';
import { getCurrentProfile } from '@/lib/auth';
import { NextResponse } from 'next/server';
import { formatDateKST } from '@/lib/timezone';

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
  created_at: string;
  updated_at: string;
}

interface RoomAvailability {
  id: string;
  project_id: string;
  room_type_id: string;
  date: string;
  total_rooms: number;
  available_rooms: number;
  price_override: number | null;
  created_at: string;
  updated_at: string;
  room_type?: RoomType;
}

export async function GET(request: Request) {
  try {
    const profile = await getCurrentProfile();

    if (!profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const roomTypeId = searchParams.get('roomTypeId');

    const conditions: string[] = [];
    const params: (string | null)[] = [];
    let paramIndex = 1;

    if (profile.role === 'super_admin') {
      if (projectId) {
        conditions.push(`ra.project_id = $${paramIndex++}`);
        params.push(projectId);
      }
    } else {
      conditions.push(`ra.project_id = $${paramIndex++}`);
      params.push(profile.project_id);
    }

    if (startDate) {
      conditions.push(`ra.date >= $${paramIndex++}`);
      params.push(startDate);
    }

    if (endDate) {
      conditions.push(`ra.date <= $${paramIndex++}`);
      params.push(endDate);
    }

    if (roomTypeId) {
      conditions.push(`ra.room_type_id = $${paramIndex++}`);
      params.push(roomTypeId);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const sql = `
      SELECT 
        ra.*,
        row_to_json(rt.*) as room_type
      FROM room_availability ra
      LEFT JOIN room_types rt ON ra.room_type_id = rt.id
      ${whereClause}
      ORDER BY ra.date ASC
    `;

    const data = await query<RoomAvailability>(sql, params);

    return NextResponse.json({ availability: data });
  } catch (error) {
    console.error('Error fetching room availability:', error);
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

    const { projectId, roomTypeId, date, totalRooms, availableRooms, priceOverride } = await request.json();

    const targetProjectId = profile.role === 'super_admin' ? projectId : profile.project_id;

    if (!targetProjectId || !roomTypeId || !date) {
      return NextResponse.json({ error: 'Project ID, room type ID, and date are required' }, { status: 400 });
    }

    // Project admins can only create availability for their own project
    if (profile.role === 'project_admin' && projectId && projectId !== profile.project_id) {
      return NextResponse.json({ error: 'Cannot create availability for other projects' }, { status: 403 });
    }

    // Use upsert (INSERT ON CONFLICT UPDATE)
    const data = await queryOne<RoomAvailability>(
      `INSERT INTO room_availability (project_id, room_type_id, date, total_rooms, available_rooms, price_override)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (room_type_id, date) DO UPDATE SET
         total_rooms = EXCLUDED.total_rooms,
         available_rooms = EXCLUDED.available_rooms,
         price_override = EXCLUDED.price_override,
         updated_at = NOW()
       RETURNING *`,
      [targetProjectId, roomTypeId, date, totalRooms ?? 0, availableRooms ?? totalRooms ?? 0, priceOverride || null]
    );

    return NextResponse.json({ success: true, availability: data });
  } catch (error) {
    console.error('Error creating room availability:', error);
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

    const { id, totalRooms, availableRooms, priceOverride, projectId } = await request.json();

    if (!id) {
      return NextResponse.json({ error: 'ID is required' }, { status: 400 });
    }

    // Project admins can only update their own project's availability
    if (profile.role === 'project_admin' && projectId && projectId !== profile.project_id) {
      return NextResponse.json({ error: 'Cannot update availability for other projects' }, { status: 403 });
    }

    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (totalRooms !== undefined) {
      updates.push(`total_rooms = $${paramIndex++}`);
      values.push(totalRooms);
    }
    if (availableRooms !== undefined) {
      updates.push(`available_rooms = $${paramIndex++}`);
      values.push(availableRooms);
    }
    if (priceOverride !== undefined) {
      updates.push(`price_override = $${paramIndex++}`);
      values.push(priceOverride);
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    values.push(id);

    const data = await queryOne<RoomAvailability>(
      `UPDATE room_availability SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    if (!data) {
      return NextResponse.json({ error: 'Availability record not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, availability: data });
  } catch (error) {
    console.error('Error updating room availability:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Bulk update availability for a date range
export async function PATCH(request: Request) {
  try {
    const profile = await getCurrentProfile();

    if (!profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (profile.role !== 'super_admin' && profile.role !== 'project_admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { projectId, roomTypeId, startDate, endDate, totalRooms, priceOverride } = await request.json();

    const targetProjectId = profile.role === 'super_admin' ? projectId : profile.project_id;

    if (!targetProjectId || !roomTypeId || !startDate || !endDate) {
      return NextResponse.json({ error: 'Project ID, room type ID, start date, and end date are required' }, { status: 400 });
    }

    // Project admins can only update their own project's availability
    if (profile.role === 'project_admin' && projectId && projectId !== profile.project_id) {
      return NextResponse.json({ error: 'Cannot update availability for other projects' }, { status: 403 });
    }

    // Generate dates between start and end
    const dates: string[] = [];
    const current = new Date(startDate);
    const end = new Date(endDate);
    while (current <= end) {
      dates.push(formatDateKST(current));
      current.setDate(current.getDate() + 1);
    }

    // Build bulk upsert query
    const values: unknown[] = [];
    const valueRows: string[] = [];
    let paramIndex = 1;

    for (const date of dates) {
      valueRows.push(`($${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++})`);
      values.push(targetProjectId, roomTypeId, date, totalRooms ?? 0, totalRooms ?? 0, priceOverride || null);
    }

    const sql = `
      INSERT INTO room_availability (project_id, room_type_id, date, total_rooms, available_rooms, price_override)
      VALUES ${valueRows.join(', ')}
      ON CONFLICT (room_type_id, date) DO UPDATE SET
        total_rooms = EXCLUDED.total_rooms,
        available_rooms = EXCLUDED.available_rooms,
        price_override = EXCLUDED.price_override,
        updated_at = NOW()
      RETURNING *
    `;

    const data = await query<RoomAvailability>(sql, values);

    return NextResponse.json({ success: true, availability: data });
  } catch (error) {
    console.error('Error bulk updating room availability:', error);
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

    if (!id) {
      return NextResponse.json({ error: 'ID is required' }, { status: 400 });
    }

    // Project admins can only delete their own project's availability
    if (profile.role === 'project_admin' && projectId && projectId !== profile.project_id) {
      return NextResponse.json({ error: 'Cannot delete availability for other projects' }, { status: 403 });
    }

    const result = await execute('DELETE FROM room_availability WHERE id = $1', [id]);

    if (result.rowCount === 0) {
      return NextResponse.json({ error: 'Availability record not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting room availability:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
