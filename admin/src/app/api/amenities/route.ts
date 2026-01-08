import { query, queryOne, execute } from '@/lib/db';
import { getCurrentProfile } from '@/lib/auth';
import { NextResponse } from 'next/server';

interface Amenity {
  id: string;
  project_id: string;
  name: string;
  price: number;
  description: string | null;
  is_active: boolean;
  display_order: number;
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
    const activeOnly = searchParams.get('activeOnly') === 'true';

    let sql: string;
    let params: (string | null)[];

    const activeClause = activeOnly ? ' AND is_active = true' : '';

    if (profile.role === 'super_admin') {
      if (projectId) {
        sql = `SELECT * FROM amenities WHERE project_id = $1${activeClause} ORDER BY display_order ASC`;
        params = [projectId];
      } else {
        sql = `SELECT * FROM amenities WHERE 1=1${activeClause} ORDER BY display_order ASC`;
        params = [];
      }
    } else if (profile.role === 'kiosk' && projectId) {
      // For kiosk users, trust the projectId from kiosk.project_id
      sql = `SELECT * FROM amenities WHERE project_id = $1${activeClause} ORDER BY display_order ASC`;
      params = [projectId];
    } else {
      sql = `SELECT * FROM amenities WHERE project_id = $1${activeClause} ORDER BY display_order ASC`;
      params = [profile.project_id];
    }

    const data = await query<Amenity>(sql, params);

    return NextResponse.json({ amenities: data });
  } catch (error) {
    console.error('Error fetching amenities:', error);
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

    const { projectId, name, price, description } = await request.json();

    const targetProjectId = profile.role === 'super_admin' ? projectId : profile.project_id;

    if (!targetProjectId || targetProjectId === 'all' || !name) {
      return NextResponse.json({ error: 'Project ID and name are required' }, { status: 400 });
    }

    // Project admins can only create amenities for their own project
    if (profile.role === 'project_admin' && projectId && projectId !== profile.project_id) {
      return NextResponse.json({ error: 'Cannot create amenities for other projects' }, { status: 403 });
    }

    // Get the highest display_order for this project
    const existingAmenity = await queryOne<{ display_order: number }>(
      'SELECT display_order FROM amenities WHERE project_id = $1 ORDER BY display_order DESC LIMIT 1',
      [targetProjectId]
    );

    const displayOrder = existingAmenity ? existingAmenity.display_order + 1 : 0;

    const data = await queryOne<Amenity>(
      `INSERT INTO amenities (project_id, name, price, description, display_order)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [targetProjectId, name, price || 0, description || null, displayOrder]
    );

    return NextResponse.json({ success: true, amenity: data });
  } catch (error) {
    console.error('Error creating amenity:', error);
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

    const { id, name, price, description, isActive, displayOrder, projectId } = await request.json();

    if (!id) {
      return NextResponse.json({ error: 'ID is required' }, { status: 400 });
    }

    // Project admins can only update their own project's amenities
    if (profile.role === 'project_admin' && projectId && projectId !== profile.project_id) {
      return NextResponse.json({ error: 'Cannot update amenities for other projects' }, { status: 403 });
    }

    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(name);
    }
    if (price !== undefined) {
      updates.push(`price = $${paramIndex++}`);
      values.push(price);
    }
    if (description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      values.push(description);
    }
    if (isActive !== undefined) {
      updates.push(`is_active = $${paramIndex++}`);
      values.push(isActive);
    }
    if (displayOrder !== undefined) {
      updates.push(`display_order = $${paramIndex++}`);
      values.push(displayOrder);
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    values.push(id);

    const data = await queryOne<Amenity>(
      `UPDATE amenities SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    if (!data) {
      return NextResponse.json({ error: 'Amenity not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, amenity: data });
  } catch (error) {
    console.error('Error updating amenity:', error);
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

    // Project admins can only delete their own project's amenities
    if (profile.role === 'project_admin' && projectId && projectId !== profile.project_id) {
      return NextResponse.json({ error: 'Cannot delete amenities for other projects' }, { status: 403 });
    }

    const result = await execute('DELETE FROM amenities WHERE id = $1', [id]);

    if (result.rowCount === 0) {
      return NextResponse.json({ error: 'Amenity not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting amenity:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
