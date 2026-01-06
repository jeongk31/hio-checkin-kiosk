import { execute, queryOne } from '@/lib/db';
import { NextResponse } from 'next/server';
import { verifyPMSToken } from '@/lib/pms-auth';

/**
 * Project data from PMS
 */
interface PMSProjectData {
  id: string;
  name: string;
  slug: string;
  logo_url?: string;
  type?: string;
  province?: string;
  location?: string;
  is_active: boolean;
  settings?: Record<string, unknown>;
  created_at: string;
  updated_at?: string;
}

/**
 * Room type data from PMS
 */
interface PMSRoomTypeData {
  id: string;
  project_id: string;
  name: string;
  description?: string;
  base_price?: number;
  capacity?: number;
  display_order?: number;
  is_active: boolean;
}

/**
 * Channel data from PMS
 */
interface PMSChannelData {
  id: string;
  project_id: string;
  name: string;
  code?: string;
  is_active: boolean;
}

/**
 * Sync payload from PMS
 */
interface ProjectSyncPayload {
  action: 'create' | 'update' | 'delete';
  project: PMSProjectData;
  room_types?: PMSRoomTypeData[];
  channels?: PMSChannelData[];
  sent_at: string;
}

/**
 * POST /api/project-sync
 * Receives project updates from PMS in real-time
 */
export async function POST(request: Request) {
  try {
    // Extract Bearer token from Authorization header
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Missing or invalid Authorization header' },
        { status: 401 }
      );
    }

    const token = authHeader.substring(7);

    // Verify token with PMS
    const verifyResult = await verifyPMSToken(token);
    if (!verifyResult.valid) {
      return NextResponse.json(
        { error: verifyResult.error || 'Invalid token' },
        { status: 401 }
      );
    }

    // Parse payload
    const payload: ProjectSyncPayload = await request.json();
    console.log('[Project Sync] Received payload:', {
      action: payload.action,
      projectId: payload.project?.id,
      projectName: payload.project?.name,
      hasRoomTypes: !!payload.room_types?.length,
      hasChannels: !!payload.channels?.length,
    });

    // Validate required fields
    if (!payload.action || !payload.project || !payload.project.id) {
      return NextResponse.json(
        { error: 'Invalid payload: action and project data are required' },
        { status: 400 }
      );
    }

    let result: { action: string; projectId: string; success: boolean };

    switch (payload.action) {
      case 'create':
      case 'update':
        await upsertProject(payload.project);
        console.log(`[Project Sync] Project ${payload.action}d:`, payload.project.id);

        // Sync room types if provided
        if (payload.room_types && payload.room_types.length > 0) {
          for (const roomType of payload.room_types) {
            await upsertRoomType(roomType);
          }
          console.log(`[Project Sync] Synced ${payload.room_types.length} room types`);
        }

        // Sync channels if provided
        if (payload.channels && payload.channels.length > 0) {
          for (const channel of payload.channels) {
            await upsertChannel(channel);
          }
          console.log(`[Project Sync] Synced ${payload.channels.length} channels`);
        }

        result = { action: payload.action, projectId: payload.project.id, success: true };
        break;

      case 'delete':
        await deleteProject(payload.project.id);
        console.log('[Project Sync] Project deleted:', payload.project.id);
        result = { action: 'delete', projectId: payload.project.id, success: true };
        break;

      default:
        return NextResponse.json(
          { error: `Invalid action: ${payload.action}` },
          { status: 400 }
        );
    }

    return NextResponse.json({
      success: true,
      message: `Project ${payload.action} completed`,
      data: {
        ...result,
        room_types_synced: payload.room_types?.length || 0,
        channels_synced: payload.channels?.length || 0,
        processed_at: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('[Project Sync] Error processing payload:', error);
    return NextResponse.json(
      { error: 'Failed to process project sync' },
      { status: 500 }
    );
  }
}

/**
 * Upsert project data
 */
async function upsertProject(project: PMSProjectData): Promise<void> {
  // Merge settings with existing settings if updating
  let finalSettings = project.settings || {};

  const existing = await queryOne<{ settings: Record<string, unknown> | null }>(
    'SELECT settings FROM projects WHERE id = $1',
    [project.id]
  );

  if (existing && existing.settings) {
    // Preserve kiosk-specific settings like daily_reset_time
    finalSettings = { ...existing.settings, ...finalSettings };
  }

  await execute(
    `INSERT INTO projects (
      id, name, slug, logo_url, type, province, location,
      is_active, settings, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      slug = EXCLUDED.slug,
      logo_url = EXCLUDED.logo_url,
      type = EXCLUDED.type,
      province = EXCLUDED.province,
      location = EXCLUDED.location,
      is_active = EXCLUDED.is_active,
      settings = $9,
      updated_at = NOW()`,
    [
      project.id,
      project.name,
      project.slug,
      project.logo_url || null,
      project.type || null,
      project.province || null,
      project.location || null,
      project.is_active,
      JSON.stringify(finalSettings),
      project.created_at,
      project.updated_at || null,
    ]
  );
}

/**
 * Upsert room type data
 */
async function upsertRoomType(roomType: PMSRoomTypeData): Promise<void> {
  await execute(
    `INSERT INTO room_types (
      id, project_id, name, description, base_price, capacity,
      display_order, is_active, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET
      project_id = EXCLUDED.project_id,
      name = EXCLUDED.name,
      description = EXCLUDED.description,
      base_price = EXCLUDED.base_price,
      capacity = EXCLUDED.capacity,
      display_order = EXCLUDED.display_order,
      is_active = EXCLUDED.is_active,
      updated_at = NOW()`,
    [
      roomType.id,
      roomType.project_id,
      roomType.name,
      roomType.description || null,
      roomType.base_price || null,
      roomType.capacity || null,
      roomType.display_order || 0,
      roomType.is_active,
    ]
  );
}

/**
 * Upsert channel data
 */
async function upsertChannel(channel: PMSChannelData): Promise<void> {
  await execute(
    `INSERT INTO channels (
      id, project_id, name, code, is_active, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET
      project_id = EXCLUDED.project_id,
      name = EXCLUDED.name,
      code = EXCLUDED.code,
      is_active = EXCLUDED.is_active,
      updated_at = NOW()`,
    [
      channel.id,
      channel.project_id,
      channel.name,
      channel.code || null,
      channel.is_active,
    ]
  );
}

/**
 * Delete project and related data
 */
async function deleteProject(projectId: string): Promise<void> {
  // Delete in order due to foreign key constraints
  await execute('DELETE FROM reservations WHERE project_id = $1', [projectId]);
  await execute('DELETE FROM rooms WHERE project_id = $1', [projectId]);
  await execute('DELETE FROM channels WHERE project_id = $1', [projectId]);
  await execute('DELETE FROM room_types WHERE project_id = $1', [projectId]);
  await execute('DELETE FROM kiosk_content WHERE project_id = $1', [projectId]);
  await execute('DELETE FROM projects WHERE id = $1', [projectId]);
}

/**
 * GET /api/project-sync
 * Returns info about the endpoint
 */
export async function GET() {
  return NextResponse.json({
    endpoint: '/api/project-sync',
    method: 'POST',
    description: 'Receives project updates from PMS in real-time',
    authentication: 'Bearer token (PMS token)',
    payload: {
      action: "'create' | 'update' | 'delete'",
      project: 'PMSProjectData (required)',
      room_types: 'PMSRoomTypeData[] (optional)',
      channels: 'PMSChannelData[] (optional)',
      sent_at: 'ISO datetime',
    },
  });
}
