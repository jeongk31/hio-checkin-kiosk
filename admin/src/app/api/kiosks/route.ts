import { NextRequest, NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/auth';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

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
  project: {
    id: string;
    name: string;
    slug: string | null;
    is_active: boolean;
    settings: Record<string, unknown> | null;
    created_at: string;
  } | null;
  profile: {
    id: string;
    email: string;
    full_name: string | null;
    role: string;
    project_id: string | null;
  } | null;
}

// GET /api/kiosks - List all kiosks
export async function GET(request: NextRequest) {
  try {
    const profile = await getCurrentProfile();
    if (!profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');

    let sql: string;
    let params: unknown[];

    // Super admins can see all kiosks, others only their project's kiosks
    if (profile.role === 'super_admin') {
      if (projectId && projectId !== 'all') {
        sql = `
          SELECT 
            k.*,
            json_build_object(
              'id', p.id,
              'name', p.name,
              'slug', p.slug,
              'is_active', p.is_active,
              'settings', p.settings,
              'created_at', p.created_at
            ) as project,
            CASE 
              WHEN pr.id IS NOT NULL THEN json_build_object(
                'id', pr.id,
                'email', pr.email,
                'full_name', pr.full_name,
                'role', pr.role,
                'project_id', pr.project_id
              )
              ELSE NULL
            END as profile
          FROM kiosks k
          LEFT JOIN projects p ON k.project_id = p.id
          LEFT JOIN profiles pr ON k.profile_id = pr.id
          WHERE k.project_id = $1
          ORDER BY k.created_at DESC
        `;
        params = [projectId];
      } else {
        sql = `
          SELECT 
            k.*,
            json_build_object(
              'id', p.id,
              'name', p.name,
              'slug', p.slug,
              'is_active', p.is_active,
              'settings', p.settings,
              'created_at', p.created_at
            ) as project,
            CASE 
              WHEN pr.id IS NOT NULL THEN json_build_object(
                'id', pr.id,
                'email', pr.email,
                'full_name', pr.full_name,
                'role', pr.role,
                'project_id', pr.project_id
              )
              ELSE NULL
            END as profile
          FROM kiosks k
          LEFT JOIN projects p ON k.project_id = p.id
          LEFT JOIN profiles pr ON k.profile_id = pr.id
          ORDER BY k.created_at DESC
        `;
        params = [];
      }
    } else {
      sql = `
        SELECT 
          k.*,
          json_build_object(
            'id', p.id,
            'name', p.name,
            'slug', p.slug,
            'is_active', p.is_active,
            'settings', p.settings,
            'created_at', p.created_at
          ) as project,
          CASE 
            WHEN pr.id IS NOT NULL THEN json_build_object(
              'id', pr.id,
              'email', pr.email,
              'full_name', pr.full_name,
              'role', pr.role,
              'project_id', pr.project_id
            )
            ELSE NULL
          END as profile
        FROM kiosks k
        LEFT JOIN projects p ON k.project_id = p.id
        LEFT JOIN profiles pr ON k.profile_id = pr.id
        WHERE k.project_id = $1
        ORDER BY k.created_at DESC
      `;
      params = [profile.project_id];
    }

    const kiosks = await query<KioskRow>(sql, params);

    return NextResponse.json({ kiosks });
  } catch (error) {
    console.error('Error fetching kiosks:', error);
    return NextResponse.json(
      { error: 'Failed to fetch kiosks' },
      { status: 500 }
    );
  }
}

// PUT /api/kiosks - Update a kiosk
export async function PUT(request: NextRequest) {
  try {
    const profile = await getCurrentProfile();
    if (!profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { id, status, current_screen, last_seen, settings } = body;

    if (!id) {
      return NextResponse.json({ error: 'Kiosk ID is required' }, { status: 400 });
    }

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

    // Add kiosk ID and optional project check
    values.push(id);
    let whereClause = `id = $${paramIndex++}`;

    // Non-super admins can only update kiosks in their project
    // Kiosk users can only update their own kiosk (linked via profile_id)
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
        // No project assigned, deny access
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
