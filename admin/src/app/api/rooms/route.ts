import { query, queryOne, execute } from '@/lib/db';
import { getCurrentProfile } from '@/lib/auth';
import { NextResponse } from 'next/server';

interface RoomRow {
  id: string;
  project_id: string;
  room_type_id: string | null;
  room_number: string;
  access_type: string;
  room_password: string | null;
  key_box_number: string | null;
  key_box_password: string | null;
  status: string;
  floor: number | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  room_type_name?: string;
  room_type_description?: string;
  room_type_base_price?: number;
  room_type_max_guests?: number;
}

function transformRoom(row: RoomRow) {
  return {
    id: row.id,
    project_id: row.project_id,
    room_type_id: row.room_type_id,
    room_number: row.room_number,
    access_type: row.access_type,
    room_password: row.room_password,
    key_box_number: row.key_box_number,
    key_box_password: row.key_box_password,
    status: row.status,
    floor: row.floor,
    notes: row.notes,
    is_active: row.is_active,
    created_at: row.created_at,
    updated_at: row.updated_at,
    room_type: row.room_type_id ? {
      id: row.room_type_id,
      name: row.room_type_name,
      description: row.room_type_description,
      base_price: row.room_type_base_price,
      max_guests: row.room_type_max_guests,
    } : null,
  };
}

export async function GET(request: Request) {
  try {
    const profile = await getCurrentProfile();

    if (!profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');
    const roomTypeId = searchParams.get('roomTypeId');
    const status = searchParams.get('status');
    const availableOnly = searchParams.get('availableOnly') === 'true';

    // Debug logging for kiosk room fetch issues
    console.log('[Rooms API] GET request:', {
      role: profile.role,
      profileProjectId: profile.project_id,
      requestedProjectId: projectId,
      availableOnly,
    });

    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (profile.role === 'super_admin') {
      if (projectId) {
        conditions.push(`r.project_id = $${paramIndex++}`);
        params.push(projectId);
      }
    } else if (profile.role === 'kiosk' && projectId) {
      // For kiosk users, trust the projectId from kiosk.project_id (passed from kiosk page)
      // This handles cases where profile.project_id might be out of sync
      conditions.push(`r.project_id = $${paramIndex++}`);
      params.push(projectId);
      console.log('[Rooms API] Kiosk using requested projectId:', projectId);
    } else {
      conditions.push(`r.project_id = $${paramIndex++}`);
      params.push(profile.project_id);
    }

    if (roomTypeId) {
      conditions.push(`r.room_type_id = $${paramIndex++}`);
      params.push(roomTypeId);
    }

    if (status) {
      conditions.push(`r.status = $${paramIndex++}`);
      params.push(status);
    }

    if (availableOnly) {
      conditions.push(`r.status = 'available'`);
      conditions.push(`r.is_active = true`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const rooms = await query<RoomRow>(
      `SELECT r.*,
              rt.name as room_type_name,
              rt.description as room_type_description,
              rt.base_price as room_type_base_price,
              rt.max_guests as room_type_max_guests
       FROM rooms r
       LEFT JOIN room_types rt ON r.room_type_id = rt.id
       ${whereClause}
       ORDER BY r.room_number ASC`,
      params
    );

    console.log('[Rooms API] Found', rooms.length, 'rooms with conditions:', conditions);
    return NextResponse.json({ rooms: rooms.map(transformRoom) });
  } catch (error) {
    console.error('Error fetching rooms:', error);
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
      roomNumber,
      accessType,
      roomPassword,
      keyBoxNumber,
      keyBoxPassword,
      floor,
      notes,
    } = await request.json();

    const targetProjectId = profile.role === 'super_admin' ? projectId : profile.project_id;

    if (!targetProjectId || targetProjectId === 'all' || !roomNumber) {
      return NextResponse.json({ error: 'Specific Project ID and room number are required' }, { status: 400 });
    }

    // Validate access type fields
    if (accessType === 'password' && !roomPassword) {
      return NextResponse.json({ error: '비밀번호를 입력해주세요' }, { status: 400 });
    }

    if (accessType === 'card' && (!keyBoxNumber || !keyBoxPassword)) {
      return NextResponse.json({ error: '키 박스 번호와 비밀번호를 입력해주세요' }, { status: 400 });
    }

    // Project admins can only create rooms for their own project
    if (profile.role === 'project_admin' && projectId && projectId !== profile.project_id) {
      return NextResponse.json({ error: 'Cannot create rooms for other projects' }, { status: 403 });
    }

    try {
      const rooms = await query<RoomRow>(
        `INSERT INTO rooms (project_id, room_type_id, room_number, access_type, room_password, key_box_number, key_box_password, floor, notes, status, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'available', true)
         RETURNING *`,
        [
          targetProjectId,
          roomTypeId || null,
          roomNumber,
          accessType || 'card',
          accessType === 'password' ? roomPassword : null,
          accessType === 'card' ? keyBoxNumber : null,
          accessType === 'card' ? keyBoxPassword : null,
          floor || null,
          notes || null,
        ]
      );

      const room = rooms[0];
      
      // Fetch with room type
      const roomWithType = await queryOne<RoomRow>(
        `SELECT r.*,
                rt.name as room_type_name,
                rt.description as room_type_description,
                rt.base_price as room_type_base_price,
                rt.max_guests as room_type_max_guests
         FROM rooms r
         LEFT JOIN room_types rt ON r.room_type_id = rt.id
         WHERE r.id = $1`,
        [room.id]
      );

      return NextResponse.json({ success: true, room: roomWithType ? transformRoom(roomWithType) : room });
    } catch (error: unknown) {
      const dbError = error as { code?: string; message?: string };
      if (dbError.code === '23505') {
        return NextResponse.json({ error: '이미 존재하는 객실 번호입니다' }, { status: 400 });
      }
      throw error;
    }
  } catch (error) {
    console.error('Error creating room:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const profile = await getCurrentProfile();

    if (!profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (profile.role !== 'super_admin' && profile.role !== 'project_admin' && profile.role !== 'kiosk') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const {
      id,
      projectId,
      roomTypeId,
      roomNumber,
      accessType,
      roomPassword,
      keyBoxNumber,
      keyBoxPassword,
      floor,
      notes,
      status,
      isActive,
    } = await request.json();

    if (!id) {
      return NextResponse.json({ error: 'ID is required' }, { status: 400 });
    }

    // Project admins can only update their own project's rooms
    if (profile.role === 'project_admin' && projectId && projectId !== profile.project_id) {
      return NextResponse.json({ error: 'Cannot update rooms for other projects' }, { status: 403 });
    }

    const setClauses: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (roomTypeId !== undefined) {
      setClauses.push(`room_type_id = $${paramIndex++}`);
      // Convert empty string to null for UUID field
      params.push(roomTypeId === '' ? null : roomTypeId);
    }
    if (roomNumber !== undefined) {
      setClauses.push(`room_number = $${paramIndex++}`);
      params.push(roomNumber);
    }
    if (accessType !== undefined) {
      setClauses.push(`access_type = $${paramIndex++}`);
      params.push(accessType);
      if (accessType === 'password') {
        setClauses.push(`room_password = $${paramIndex++}`);
        params.push(roomPassword || null);
        setClauses.push(`key_box_number = NULL`);
        setClauses.push(`key_box_password = NULL`);
      } else {
        setClauses.push(`room_password = NULL`);
        setClauses.push(`key_box_number = $${paramIndex++}`);
        params.push(keyBoxNumber || null);
        setClauses.push(`key_box_password = $${paramIndex++}`);
        params.push(keyBoxPassword || null);
      }
    } else {
      if (roomPassword !== undefined) {
        setClauses.push(`room_password = $${paramIndex++}`);
        params.push(roomPassword);
      }
      if (keyBoxNumber !== undefined) {
        setClauses.push(`key_box_number = $${paramIndex++}`);
        params.push(keyBoxNumber);
      }
      if (keyBoxPassword !== undefined) {
        setClauses.push(`key_box_password = $${paramIndex++}`);
        params.push(keyBoxPassword);
      }
    }
    if (floor !== undefined) {
      setClauses.push(`floor = $${paramIndex++}`);
      params.push(floor);
    }
    if (notes !== undefined) {
      setClauses.push(`notes = $${paramIndex++}`);
      params.push(notes);
    }
    if (status !== undefined) {
      setClauses.push(`status = $${paramIndex++}`);
      params.push(status);
    }
    if (isActive !== undefined) {
      setClauses.push(`is_active = $${paramIndex++}`);
      params.push(isActive);
    }

    params.push(id);

    const rooms = await query<RoomRow>(
      `UPDATE rooms SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      params
    );

    if (rooms.length === 0) {
      return NextResponse.json({ error: 'Room not found' }, { status: 404 });
    }

    const room = rooms[0];
    
    // Fetch with room type
    const roomWithType = await queryOne<RoomRow>(
      `SELECT r.*,
              rt.name as room_type_name,
              rt.description as room_type_description,
              rt.base_price as room_type_base_price,
              rt.max_guests as room_type_max_guests
       FROM rooms r
       LEFT JOIN room_types rt ON r.room_type_id = rt.id
       WHERE r.id = $1`,
      [room.id]
    );

    return NextResponse.json({ success: true, room: roomWithType ? transformRoom(roomWithType) : room });
  } catch (error) {
    console.error('Error updating room:', error);
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

    // Project admins can only delete their own project's rooms
    if (profile.role === 'project_admin' && projectId && projectId !== profile.project_id) {
      return NextResponse.json({ error: 'Cannot delete rooms for other projects' }, { status: 403 });
    }

    await execute('DELETE FROM rooms WHERE id = $1', [id]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting room:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
