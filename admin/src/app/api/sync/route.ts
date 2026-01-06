import { getCurrentProfile } from '@/lib/auth';
import { execute, queryOne } from '@/lib/db';
import { NextResponse } from 'next/server';
import {
  fetchAllPMSProjects,
  fetchAllPMSKioskUsers,
  fetchPMSProject,
  getKioskRole,
  PMSProject,
  PMSUser,
} from '@/lib/pms-auth';
import { cookies } from 'next/headers';

// Cache to prevent too frequent syncs (5 minute cache)
const SYNC_CACHE_MS = 5 * 60 * 1000;
const syncCache = new Map<string, number>();

/**
 * Sync a single project from PMS
 */
async function syncSingleProject(pmsProject: PMSProject): Promise<void> {
  // Get existing settings to preserve kiosk-specific settings like daily_reset_time
  const existing = await queryOne<{ settings: Record<string, unknown> | null }>(
    'SELECT settings FROM projects WHERE id = $1',
    [pmsProject.id]
  );

  const existingSettings = existing?.settings || {};
  const newSettings = {
    ...existingSettings, // Preserve existing kiosk settings
    type: pmsProject.type || existingSettings.type || null,
    province: pmsProject.province || existingSettings.province || null,
    location: pmsProject.location || pmsProject.province || existingSettings.location || null,
  };

  const slug = pmsProject.name
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, '-')
    .replace(/^-|-$/g, '') || `project-${pmsProject.id.substring(0, 8)}`;

  await execute(
    `INSERT INTO projects (id, name, slug, logo_url, settings, is_active)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name,
       logo_url = COALESCE(EXCLUDED.logo_url, projects.logo_url),
       settings = $5,
       is_active = EXCLUDED.is_active,
       updated_at = NOW()`,
    [pmsProject.id, pmsProject.name, slug, pmsProject.logo_url || null, JSON.stringify(newSettings), pmsProject.is_active]
  );
}

/**
 * Sync a single user from PMS
 */
async function syncSingleUser(pmsUser: PMSUser): Promise<void> {
  const kioskRole = getKioskRole(pmsUser.role);

  // Create or update user
  await execute(
    `INSERT INTO users (id, email, password_hash)
     VALUES ($1, $2, $3)
     ON CONFLICT (id) DO UPDATE SET email = $2`,
    [pmsUser.id, pmsUser.email, 'pms-managed']
  );

  // Create or update profile
  await execute(
    `INSERT INTO profiles (user_id, email, full_name, role, is_active, project_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (user_id) DO UPDATE SET
       email = EXCLUDED.email,
       full_name = COALESCE(EXCLUDED.full_name, profiles.full_name),
       role = EXCLUDED.role,
       is_active = EXCLUDED.is_active,
       project_id = EXCLUDED.project_id,
       updated_at = NOW()`,
    [pmsUser.id, pmsUser.email, pmsUser.username || null, kioskRole, pmsUser.is_active, pmsUser.project_id]
  );

  // Auto-create kiosk device for kiosk users
  if (kioskRole === 'kiosk' && pmsUser.project_id) {
    const profile = await queryOne<{ id: string }>('SELECT id FROM profiles WHERE user_id = $1', [pmsUser.id]);
    if (profile) {
      const existingKiosk = await queryOne('SELECT id FROM kiosks WHERE profile_id = $1', [profile.id]);
      if (!existingKiosk) {
        await execute(
          `INSERT INTO kiosks (id, project_id, profile_id, name, location, status)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, 'offline')
           ON CONFLICT DO NOTHING`,
          [pmsUser.project_id, profile.id, `${pmsUser.username || pmsUser.email} Device`, 'Auto-created from PMS']
        );
      }
    }
  }
}

/**
 * POST /api/sync
 * Sync projects and users from PMS
 * Called automatically on kiosk/dashboard access
 */
export async function POST(request: Request) {
  try {
    const profile = await getCurrentProfile();
    if (!profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get PMS token from session/cookie
    const cookieStore = await cookies();
    const pmsToken = cookieStore.get('pms_token')?.value;

    if (!pmsToken) {
      return NextResponse.json({
        error: 'No PMS token available',
        message: 'Please login again to sync with PMS'
      }, { status: 401 });
    }

    // Check cache to prevent too frequent syncs
    const cacheKey = `sync-${profile.user_id}`;
    const lastSync = syncCache.get(cacheKey);
    const now = Date.now();

    if (lastSync && (now - lastSync) < SYNC_CACHE_MS) {
      const remainingMs = SYNC_CACHE_MS - (now - lastSync);
      return NextResponse.json({
        success: true,
        cached: true,
        message: `Sync skipped (cached for ${Math.ceil(remainingMs / 1000)}s more)`,
      });
    }

    let projectsSynced = 0;
    let usersSynced = 0;

    // Super admins sync everything, others just their project
    if (profile.role === 'super_admin') {
      // Sync all projects
      const projectsResult = await fetchAllPMSProjects(pmsToken);
      if (projectsResult.success) {
        for (const pmsProject of projectsResult.projects) {
          await syncSingleProject(pmsProject);
          projectsSynced++;
        }
      }

      // Sync all kiosk users
      const usersResult = await fetchAllPMSKioskUsers(pmsToken);
      if (usersResult.success) {
        for (const pmsUser of usersResult.users) {
          await syncSingleUser(pmsUser);
          usersSynced++;
        }
      }
    } else if (profile.project_id) {
      // Non-super admins just sync their own project
      const projectResult = await fetchPMSProject(profile.project_id, pmsToken);
      if (projectResult.success) {
        await syncSingleProject(projectResult.project);
        projectsSynced = 1;
      }
    }

    // Update cache
    syncCache.set(cacheKey, now);

    return NextResponse.json({
      success: true,
      synced: {
        projects: projectsSynced,
        users: usersSynced,
      },
      synced_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Sync] Error:', error);
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 });
  }
}

/**
 * GET /api/sync
 * Check sync status
 */
export async function GET() {
  try {
    const profile = await getCurrentProfile();
    if (!profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const cacheKey = `sync-${profile.user_id}`;
    const lastSync = syncCache.get(cacheKey);

    return NextResponse.json({
      lastSync: lastSync ? new Date(lastSync).toISOString() : null,
      cacheExpiresIn: lastSync ? Math.max(0, SYNC_CACHE_MS - (Date.now() - lastSync)) : 0,
    });
  } catch (error) {
    console.error('[Sync] Status check error:', error);
    return NextResponse.json({ error: 'Failed to check sync status' }, { status: 500 });
  }
}
