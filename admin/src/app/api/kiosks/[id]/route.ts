import { NextRequest, NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/auth';
import { queryOne, execute, query } from '@/lib/db';

interface KioskRow {
  id: string;
  name: string;
  location: string | null;
  project_id: string;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const profile = await getCurrentProfile();
    if (!profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    // Super admins can access any kiosk, others only their project's kiosks
    let kiosk: KioskRow | null;
    if (profile.role === 'super_admin') {
      kiosk = await queryOne<KioskRow>(
        'SELECT id, name, location, project_id FROM kiosks WHERE id = $1',
        [id]
      );
    } else {
      kiosk = await queryOne<KioskRow>(
        'SELECT id, name, location, project_id FROM kiosks WHERE id = $1 AND project_id = $2',
        [id, profile.project_id]
      );
    }

    if (!kiosk) {
      return NextResponse.json({ error: 'Kiosk not found' }, { status: 404 });
    }

    return NextResponse.json(kiosk);
  } catch (error) {
    console.error('Error fetching kiosk:', error);
    return NextResponse.json(
      { error: 'Failed to fetch kiosk' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const profile = await getCurrentProfile();
    if (!profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    // Only super admins and project admins can delete kiosks
    if (profile.role === 'super_admin') {
      await execute('DELETE FROM kiosks WHERE id = $1', [id]);
    } else if (profile.role === 'project_admin') {
      // Project admins can only delete kiosks in their project
      await execute(
        'DELETE FROM kiosks WHERE id = $1 AND project_id = $2',
        [id, profile.project_id]
      );
    } else {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting kiosk:', error);
    return NextResponse.json(
      { error: 'Failed to delete kiosk' },
      { status: 500 }
    );
  }
}

interface KioskRow {
  id: string;
  name: string;
  location: string | null;
  project_id: string;
  profile_id: string | null;
  status: string;
  current_screen: string | null;
  last_seen: string | null;
  settings: Record<string, unknown> | null;
  created_at: string;
}

// PUT /api/kiosks/[id] - Update a kiosk by ID
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const profile = await getCurrentProfile();
    if (!profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { status, current_screen, last_seen, settings } = body;

    // Build update query dynamically
    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (status !== undefined) {
      updates.push(`status = $${paramIndex++}`);
      values.push(status);
    }
    if (current_screen !== undefined) {
      updates.push(`current_screen = $${paramIndex++}`);
      values.push(current_screen);
    }
    if (last_seen !== undefined) {
      updates.push(`last_seen = $${paramIndex++}`);
      values.push(last_seen);
    }
    if (settings !== undefined) {
      updates.push(`settings = $${paramIndex++}`);
      values.push(JSON.stringify(settings));
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    // Add kiosk ID
    values.push(id);
    let whereClause = `id = $${paramIndex++}`;

    // Authorization check
    if (profile.role !== 'super_admin') {
      if (profile.role === 'kiosk') {
        // Kiosk users can only update their own kiosk
        values.push(profile.id);
        whereClause += ` AND profile_id = $${paramIndex}`;
      } else if (profile.project_id) {
        // Project admins can update any kiosk in their project
        values.push(profile.project_id);
        whereClause += ` AND project_id = $${paramIndex}`;
      } else {
        return NextResponse.json({ error: 'No project assigned to user' }, { status: 403 });
      }
    }

    const sql = `
      UPDATE kiosks
      SET ${updates.join(', ')}
      WHERE ${whereClause}
      RETURNING *
    `;

    const result = await query<KioskRow>(sql, values);

    if (result.length === 0) {
      return NextResponse.json({ error: 'Kiosk not found or access denied' }, { status: 404 });
    }

    return NextResponse.json({ kiosk: result[0] });
  } catch (error) {
    console.error('Error updating kiosk:', error);
    return NextResponse.json(
      { error: 'Failed to update kiosk' },
      { status: 500 }
    );
  }
}
