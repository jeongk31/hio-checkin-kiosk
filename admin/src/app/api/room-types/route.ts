import { query, queryOne, execute } from '@/lib/db';
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
  created_at: string;
  updated_at: string;
}

export async function GET(request: Request) {
  try {
    const profile = await getCurrentProfile();

    if (!profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');

    let sql: string;
    let params: (string | null)[];

    if (profile.role === 'super_admin') {
      if (projectId) {
        sql = 'SELECT * FROM room_types WHERE project_id = $1 ORDER BY display_order ASC';
        params = [projectId];
      } else {
        sql = 'SELECT * FROM room_types ORDER BY display_order ASC';
        params = [];
      }
    } else {
      sql = 'SELECT * FROM room_types WHERE project_id = $1 ORDER BY display_order ASC';
      params = [profile.project_id];
    }

    const data = await query<RoomType>(sql, params);

    return NextResponse.json({ roomTypes: data });
  } catch (error) {
    console.error('Error fetching room types:', error);
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

    const { projectId, name, description, basePrice, maxGuests, imageUrl } = await request.json();

    const targetProjectId = profile.role === 'super_admin' ? projectId : profile.project_id;

    if (!targetProjectId || targetProjectId === 'all' || !name) {
      return NextResponse.json({ error: 'Specific Project ID and name are required' }, { status: 400 });
    }

    // Project admins can only create room types for their own project
    if (profile.role === 'project_admin' && projectId && projectId !== profile.project_id) {
      return NextResponse.json({ error: 'Cannot create room types for other projects' }, { status: 403 });
    }

    // Get the highest display_order for this project
    const existingRoomType = await queryOne<{ display_order: number }>(
      'SELECT display_order FROM room_types WHERE project_id = $1 ORDER BY display_order DESC LIMIT 1',
      [targetProjectId]
    );

    const displayOrder = existingRoomType ? existingRoomType.display_order + 1 : 0;

    // Handle images - if imageUrl is provided, wrap in array for jsonb
    const images = imageUrl ? JSON.stringify([imageUrl]) : '[]';

    const data = await queryOne<RoomType>(
      `INSERT INTO room_types (project_id, name, description, base_price, max_guests, display_order, images)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
       RETURNING *`,
      [targetProjectId, name, description || null, basePrice || 0, maxGuests || 2, displayOrder, images]
    );

    return NextResponse.json({ success: true, roomType: data });
  } catch (error) {
    console.error('Error creating room type:', error);
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

    const { id, name, description, basePrice, maxGuests, isActive, displayOrder, projectId, imageUrl } = await request.json();

    if (!id) {
      return NextResponse.json({ error: 'ID is required' }, { status: 400 });
    }

    // Project admins can only update their own project's room types
    if (profile.role === 'project_admin' && projectId && projectId !== profile.project_id) {
      return NextResponse.json({ error: 'Cannot update room types for other projects' }, { status: 403 });
    }

    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(name);
    }
    if (description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      values.push(description);
    }
    if (basePrice !== undefined) {
      updates.push(`base_price = $${paramIndex++}`);
      values.push(basePrice);
    }
    if (maxGuests !== undefined) {
      updates.push(`max_guests = $${paramIndex++}`);
      values.push(maxGuests);
    }
    if (isActive !== undefined) {
      updates.push(`is_active = $${paramIndex++}`);
      values.push(isActive);
    }
    if (displayOrder !== undefined) {
      updates.push(`display_order = $${paramIndex++}`);
      values.push(displayOrder);
    }
    if (imageUrl !== undefined) {
      updates.push(`image_url = $${paramIndex++}`);
      values.push(imageUrl);
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    values.push(id);

    const data = await queryOne<RoomType>(
      `UPDATE room_types SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    if (!data) {
      return NextResponse.json({ error: 'Room type not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, roomType: data });
  } catch (error) {
    console.error('Error updating room type:', error);
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

    // Project admins can only delete their own project's room types
    if (profile.role === 'project_admin' && projectId && projectId !== profile.project_id) {
      return NextResponse.json({ error: 'Cannot delete room types for other projects' }, { status: 403 });
    }

    const result = await execute('DELETE FROM room_types WHERE id = $1', [id]);

    if (result.rowCount === 0) {
      return NextResponse.json({ error: 'Room type not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting room type:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
