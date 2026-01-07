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

  // Check if a user with this email already exists with a different ID
  const existingUserByEmail = await queryOne<{ id: string; email: string }>(
    'SELECT id, email FROM users WHERE email = $1',
    [pmsUser.email]
  );

  if (existingUserByEmail && existingUserByEmail.id !== pmsUser.id) {
    // Email exists with different ID - need to migrate to PMS ID
    console.log(`[Sync] Email ${pmsUser.email} exists with different ID. Updating to PMS ID: ${pmsUser.id}`);
    
    const oldUserId = existingUserByEmail.id;
    
    // Delete all foreign key references to the old user ID
    await execute('DELETE FROM sessions WHERE user_id = $1', [oldUserId]);
    
    // Get the profile ID before deleting (for kiosk cleanup)
    const oldProfile = await queryOne<{ id: string }>('SELECT id FROM profiles WHERE user_id = $1', [oldUserId]);
    
    // Delete kiosks associated with the old profile
    if (oldProfile) {
      await execute('DELETE FROM kiosks WHERE profile_id = $1', [oldProfile.id]);
    }
    
    // Delete the old profile
    await execute('DELETE FROM profiles WHERE user_id = $1', [oldUserId]);
    
    // Now we can safely delete the old user and create new one with PMS ID
    await execute('DELETE FROM users WHERE id = $1', [oldUserId]);
    
    // Create user with the correct PMS ID
    await execute(
      'INSERT INTO users (id, email, password_hash) VALUES ($1, $2, $3)',
      [pmsUser.id, pmsUser.email, 'pms-managed']
    );
  } else {
    // Create or update user by ID
    await execute(
      `INSERT INTO users (id, email, password_hash)
       VALUES ($1, $2, $3)
       ON CONFLICT (id) DO UPDATE SET 
         email = EXCLUDED.email,
         password_hash = EXCLUDED.password_hash`,
      [pmsUser.id, pmsUser.email, 'pms-managed']
    );
  }

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
 * Public endpoint - no authentication required
 * Uses server-to-server communication with PMS
 * Query params:
 *   - force=true: Skip cache and force sync
 *   - project_id=xxx: Sync specific project only
 */
export async function POST(request: Request) {
  try {
    // Check if force sync is requested
    const url = new URL(request.url);
    const forceSync = url.searchParams.get('force') === 'true';
    const specificProjectId = url.searchParams.get('project_id');

    // Use global cache key for public sync
    const cacheKey = specificProjectId ? `sync-project-${specificProjectId}` : 'sync-all';
    const lastSync = syncCache.get(cacheKey);
    const now = Date.now();

    if (!forceSync && lastSync && (now - lastSync) < SYNC_CACHE_MS) {
      const remainingMs = SYNC_CACHE_MS - (now - lastSync);
      return NextResponse.json({
        success: true,
        cached: true,
        message: `Sync skipped (cached for ${Math.ceil(remainingMs / 1000)}s more)`,
      });
    }

    // Try to get PMS token from cookie (optional - for user-specific syncs)
    const cookieStore = await cookies();
    const pmsToken = cookieStore.get('pms_token')?.value;

    let projectsSynced = 0;
    let usersSynced = 0;

    // If we have a token, use it for full sync including users
    if (pmsToken) {
      const profile = await getCurrentProfile();
      
      if (profile?.role === 'super_admin' || !specificProjectId) {
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
      } else if (specificProjectId || profile?.project_id) {
        // Sync specific project
        const projectId = specificProjectId || profile?.project_id;
        if (projectId) {
          const projectResult = await fetchPMSProject(projectId, pmsToken);
          if (projectResult.success) {
            await syncSingleProject(projectResult.project);
            projectsSynced = 1;
          }
        }
      }
    } else {
      // No token - just return success without syncing
      // Projects will be synced when user logs in
      return NextResponse.json({
        success: true,
        message: 'No PMS token - sync will happen on login',
        synced: { projects: 0, users: 0 },
      });
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
 * Check sync status - public endpoint
 */
export async function GET() {
  try {
    // Check both global and user-specific cache
    const globalLastSync = syncCache.get('sync-all');

    return NextResponse.json({
      lastSync: globalLastSync ? new Date(globalLastSync).toISOString() : null,
      cacheExpiresIn: globalLastSync ? Math.max(0, SYNC_CACHE_MS - (Date.now() - globalLastSync)) : 0,
    });
  } catch (error) {
    console.error('[Sync] Status check error:', error);
    return NextResponse.json({ error: 'Failed to check sync status' }, { status: 500 });
  }
}
