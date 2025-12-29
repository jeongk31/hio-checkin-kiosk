import { query, queryOne, execute } from '@/lib/db';
import { getCurrentProfile } from '@/lib/auth';
import { NextResponse } from 'next/server';

interface RoomType {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  base_price: number | null;
  capacity: number | null;
  amenities: string[] | null;
  created_at: string;
  updated_at: string;
}

interface Reservation {
  id: string;
  project_id: string;
  room_type_id: string | null;
  reservation_number: string;
  guest_name: string | null;
  guest_phone: string | null;
  guest_email: string | null;
  guest_count: number;
  check_in_date: string;
  check_out_date: string;
  room_number: string | null;
  status: string;
  source: string | null;
  notes: string | null;
  total_price: number | null;
  created_at: string;
  updated_at: string;
  room_type?: RoomType | null;
}

export async function GET(request: Request) {
  try {
    const profile = await getCurrentProfile();

    if (!profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');
    const checkInDate = searchParams.get('checkInDate');
    const beforeDate = searchParams.get('beforeDate');
    const status = searchParams.get('status');
    const reservationNumber = searchParams.get('reservationNumber');
    const limit = searchParams.get('limit');

    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (profile.role === 'super_admin') {
      if (projectId && projectId !== 'all') {
        conditions.push(`r.project_id = $${paramIndex++}`);
        params.push(projectId);
      }
    } else {
      conditions.push(`r.project_id = $${paramIndex++}`);
      params.push(profile.project_id);
    }

    if (checkInDate) {
      conditions.push(`r.check_in_date = $${paramIndex++}`);
      params.push(checkInDate);
    }

    if (beforeDate) {
      conditions.push(`r.check_in_date < $${paramIndex++}`);
      params.push(beforeDate);
    }

    if (status) {
      conditions.push(`r.status = $${paramIndex++}`);
      params.push(status);
    }

    if (reservationNumber) {
      conditions.push(`r.reservation_number ILIKE $${paramIndex++}`);
      params.push(`%${reservationNumber}%`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limitClause = limit ? `LIMIT ${parseInt(limit)}` : '';

    const sql = `
      SELECT 
        r.*,
        CASE WHEN rt.id IS NOT NULL THEN
          jsonb_build_object(
            'id', rt.id,
            'project_id', rt.project_id,
            'name', rt.name,
            'description', rt.description,
            'base_price', rt.base_price,
            'max_guests', rt.max_guests,
            'images', rt.images,
            'is_active', rt.is_active,
            'display_order', rt.display_order,
            'created_at', rt.created_at,
            'updated_at', rt.updated_at
          )
        ELSE NULL END as room_type
      FROM reservations r
      LEFT JOIN room_types rt ON r.room_type_id = rt.id
      ${whereClause}
      ORDER BY r.check_in_date DESC, r.created_at DESC
      ${limitClause}
    `;

    const data = await query<Reservation>(sql, params);

    return NextResponse.json({ reservations: data });
  } catch (error) {
    console.error('Error fetching reservations:', error);
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

    const {
      projectId,
      roomTypeId,
      reservationNumber,
      guestName,
      guestPhone,
      guestEmail,
      guestCount,
      checkInDate,
      checkOutDate,
      roomNumber,
      source,
      notes,
      totalPrice,
      status: inputStatus,
    } = await request.json();

    const targetProjectId = profile.role === 'super_admin' ? projectId : profile.project_id;

    if (!targetProjectId || !reservationNumber || !checkInDate || !checkOutDate) {
      return NextResponse.json({
        error: 'Project ID, reservation number, check-in date, and check-out date are required'
      }, { status: 400 });
    }

    // Project admins can only create reservations for their own project
    if (profile.role === 'project_admin' && projectId && projectId !== profile.project_id) {
      return NextResponse.json({ error: 'Cannot create reservations for other projects' }, { status: 403 });
    }

    try {
      const data = await queryOne<Reservation>(`
        INSERT INTO reservations (
          project_id, room_type_id, reservation_number, guest_name, guest_phone,
          guest_email, guest_count, check_in_date, check_out_date, room_number,
          source, notes, total_price, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        RETURNING *
      `, [
        targetProjectId,
        roomTypeId || null,
        reservationNumber,
        guestName || null,
        guestPhone || null,
        guestEmail || null,
        guestCount || 1,
        checkInDate,
        checkOutDate,
        roomNumber || null,
        source || null,
        notes || null,
        totalPrice || null,
        inputStatus || 'pending',
      ]);

      return NextResponse.json({ success: true, reservation: data });
    } catch (err) {
      const error = err as Error;
      if (error.message.includes('duplicate key') || error.message.includes('unique constraint')) {
        return NextResponse.json({ error: '이미 존재하는 예약번호입니다' }, { status: 400 });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
  } catch (error) {
    console.error('Error creating reservation:', error);
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

    const {
      id,
      projectId,
      roomTypeId,
      reservationNumber,
      guestName,
      guestPhone,
      guestEmail,
      guestCount,
      checkInDate,
      checkOutDate,
      roomNumber,
      status,
      source,
      notes,
      totalPrice,
    } = await request.json();

    if (!id) {
      return NextResponse.json({ error: 'ID is required' }, { status: 400 });
    }

    // Project admins can only update their own project's reservations
    if (profile.role === 'project_admin' && projectId && projectId !== profile.project_id) {
      return NextResponse.json({ error: 'Cannot update reservations for other projects' }, { status: 403 });
    }

    const setClauses: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (roomTypeId !== undefined) {
      setClauses.push(`room_type_id = $${paramIndex++}`);
      params.push(roomTypeId);
    }
    if (reservationNumber !== undefined) {
      setClauses.push(`reservation_number = $${paramIndex++}`);
      params.push(reservationNumber);
    }
    if (guestName !== undefined) {
      setClauses.push(`guest_name = $${paramIndex++}`);
      params.push(guestName);
    }
    if (guestPhone !== undefined) {
      setClauses.push(`guest_phone = $${paramIndex++}`);
      params.push(guestPhone);
    }
    if (guestEmail !== undefined) {
      setClauses.push(`guest_email = $${paramIndex++}`);
      params.push(guestEmail);
    }
    if (guestCount !== undefined) {
      setClauses.push(`guest_count = $${paramIndex++}`);
      params.push(guestCount);
    }
    if (checkInDate !== undefined) {
      setClauses.push(`check_in_date = $${paramIndex++}`);
      params.push(checkInDate);
    }
    if (checkOutDate !== undefined) {
      setClauses.push(`check_out_date = $${paramIndex++}`);
      params.push(checkOutDate);
    }
    if (roomNumber !== undefined) {
      setClauses.push(`room_number = $${paramIndex++}`);
      params.push(roomNumber);
    }
    if (status !== undefined) {
      setClauses.push(`status = $${paramIndex++}`);
      params.push(status);
    }
    if (source !== undefined) {
      setClauses.push(`source = $${paramIndex++}`);
      params.push(source);
    }
    if (notes !== undefined) {
      setClauses.push(`notes = $${paramIndex++}`);
      params.push(notes);
    }
    if (totalPrice !== undefined) {
      setClauses.push(`total_price = $${paramIndex++}`);
      params.push(totalPrice);
    }

    if (setClauses.length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    setClauses.push(`updated_at = NOW()`);
    params.push(id);

    const sql = `
      UPDATE reservations
      SET ${setClauses.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const data = await queryOne<Reservation>(sql, params);

    if (!data) {
      return NextResponse.json({ error: 'Reservation not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, reservation: data });
  } catch (error) {
    console.error('Error updating reservation:', error);
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

    // Project admins can only delete their own project's reservations
    if (profile.role === 'project_admin' && projectId && projectId !== profile.project_id) {
      return NextResponse.json({ error: 'Cannot delete reservations for other projects' }, { status: 403 });
    }

    const result = await execute('DELETE FROM reservations WHERE id = $1', [id]);

    if (result.rowCount === 0) {
      return NextResponse.json({ error: 'Reservation not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting reservation:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
