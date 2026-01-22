import { createSession, setSessionCookie, verifyPassword } from '@/lib/db/auth';
import { queryOne, execute } from '@/lib/db';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import {
  authenticateWithPMS,
  getKioskRole,
  fetchPMSProject,
  fetchAllPMSProjects,
  fetchAllPMSKioskUsers,
  PMSProject,
  PMSUser,
} from '@/lib/pms-auth';

// Local user type for database auth
interface LocalUser {
  id: string;
  email: string;
  password_hash: string;
}

interface LocalProfile {
  id: string;
  user_id: string;
  email: string;
  role: string;
  is_active: boolean;
  project_id: string | null;
}

interface ProfileRow {
  id?: string;
  user_id: string;
  role: string;
  is_active: boolean;
  email?: string;
  project_id?: string | null;
}

// Sync all projects and kiosk users from PMS (called for super admins)
async function syncAllFromPMS(pmsToken: string): Promise<void> {
  try {
    console.log('[PMS Sync] Starting full sync from PMS...');

    // Sync all projects
    const projectsResult = await fetchAllPMSProjects(pmsToken);
    console.log('[PMS Sync] Projects result:', projectsResult.success ? `${projectsResult.projects.length} projects` : projectsResult.error);
    if (projectsResult.success) {
      for (const pmsProject of projectsResult.projects) {
        console.log('[PMS Sync] Syncing project:', pmsProject.id, pmsProject.name);
        await syncSingleProject(pmsProject);
      }
    }

    // Sync all kiosk users
    const usersResult = await fetchAllPMSKioskUsers(pmsToken);
    console.log('[PMS Sync] Users result:', usersResult.success ? `${usersResult.users.length} users` : usersResult.error);
    if (usersResult.success) {
      // Get list of valid PMS user emails
      const validPmsEmails = usersResult.users.map(u => u.email);
      console.log('[PMS Sync] Valid PMS emails:', validPmsEmails);

      // Sync each user from PMS
      for (const pmsUser of usersResult.users) {
        console.log('[PMS Sync] Syncing user:', pmsUser.id, pmsUser.email, 'project:', pmsUser.project_id);
        await syncSingleUser(pmsUser);
      }

      // Deactivate local kiosk profiles that are NOT in PMS anymore
      // Only affects profiles with role='kiosk' and password_hash='pms-managed'
      if (validPmsEmails.length > 0) {
        await execute(
          `UPDATE profiles SET is_active = false, updated_at = NOW()
           WHERE role = 'kiosk'
           AND email NOT IN (SELECT unnest($1::text[]))
           AND user_id IN (SELECT id FROM users WHERE password_hash = 'pms-managed')
           AND is_active = true`,
          [validPmsEmails]
        );
        console.log('[PMS Sync] Deactivated stale kiosk profiles');
      }
    }

    console.log('[PMS Sync] Sync completed');
  } catch (error) {
    console.error('[PMS Sync] Full sync error:', error);
    // Don't throw - sync errors shouldn't block login
  }
}

// Sync a single project from PMS
async function syncSingleProject(pmsProject: PMSProject): Promise<void> {
  // Use city/district from PMS, fall back to legacy province/location fields
  const city = pmsProject.city || pmsProject.province || null;
  const district = pmsProject.district || null;
  const fullLocation = district ? `${city} ${district}` : city;

  const settings = JSON.stringify({
    type: pmsProject.type || null,
    city: city,
    district: district,
    province: city,
    location: fullLocation,
  });

  const slug = pmsProject.name
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, '-')
    .replace(/^-|-$/g, '') || `project-${pmsProject.id.substring(0, 8)}`;

  await execute(
    `INSERT INTO projects (id, name, slug, logo_url, settings, region, type, province, location, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name,
       logo_url = COALESCE(EXCLUDED.logo_url, projects.logo_url),
       settings = EXCLUDED.settings,
       region = EXCLUDED.region,
       type = EXCLUDED.type,
       province = EXCLUDED.province,
       location = EXCLUDED.location,
       is_active = EXCLUDED.is_active,
       updated_at = NOW()`,
    [pmsProject.id, pmsProject.name, slug, pmsProject.logo_url || null, settings, city, pmsProject.type || null, city, fullLocation, pmsProject.is_active]
  );
}

// Sync a single user from PMS
async function syncSingleUser(pmsUser: PMSUser): Promise<void> {
  const kioskRole = getKioskRole(pmsUser.role);

  console.log('[PMS Sync] syncSingleUser called with:', JSON.stringify({
    id: pmsUser.id,
    email: pmsUser.email,
    role: pmsUser.role,
    project_id: pmsUser.project_id,
    kioskRole: kioskRole,
  }));

  // Check if user exists by email (may have different local ID)
  const existingUser = await queryOne<{ id: string }>('SELECT id FROM users WHERE email = $1', [pmsUser.email]);

  // Use existing local ID if found, otherwise use PMS ID
  const userId = existingUser?.id || pmsUser.id;

  // Create or update user - use email as conflict key since it's unique
  await execute(
    `INSERT INTO users (id, email, password_hash)
     VALUES ($1, $2, $3)
     ON CONFLICT (email) DO UPDATE SET
       password_hash = CASE WHEN users.password_hash = 'pms-managed' OR $3 = 'pms-managed' THEN 'pms-managed' ELSE users.password_hash END`,
    [userId, pmsUser.email, 'pms-managed']
  );

  // Create or update profile - use user_id we determined above
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
    [userId, pmsUser.email, pmsUser.username || null, kioskRole, pmsUser.is_active, pmsUser.project_id]
  );

  // Auto-create or update kiosk device for kiosk and call_only users
  if ((kioskRole === 'kiosk' || kioskRole === 'call_only') && pmsUser.project_id) {
    const profile = await queryOne<{ id: string }>('SELECT id FROM profiles WHERE user_id = $1', [userId]);
    if (profile) {
      const existingKiosk = await queryOne<{ id: string; project_id: string }>(
        'SELECT id, project_id FROM kiosks WHERE profile_id = $1',
        [profile.id]
      );
      if (existingKiosk) {
        // Update existing kiosk to correct project if needed
        if (existingKiosk.project_id !== pmsUser.project_id) {
          console.log(`[PMS Sync] Updating kiosk ${existingKiosk.id} project from ${existingKiosk.project_id} to ${pmsUser.project_id}`);
          await execute(
            `UPDATE kiosks SET project_id = $1, updated_at = NOW() WHERE id = $2`,
            [pmsUser.project_id, existingKiosk.id]
          );
        }
      } else {
        // Create new kiosk
        await execute(
          `INSERT INTO kiosks (id, project_id, profile_id, name, location, status)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, 'offline')`,
          [pmsUser.project_id, profile.id, `${pmsUser.username || pmsUser.email} Device`, 'Auto-created from PMS']
        );
      }
    }
  }
}

// Helper to find or create local project matching PMS project_id
// Syncs full project details from PMS including type, province, etc.
async function syncProjectFromPMS(
  pmsProjectId: string | null,
  pmsToken: string
): Promise<string | null> {
  if (!pmsProjectId) return null;

  // Try to fetch full project details from PMS
  const pmsResult = await fetchPMSProject(pmsProjectId, pmsToken);

  if (pmsResult.success) {
    const pmsProject: PMSProject = pmsResult.project;

    // Use city/district from PMS, fall back to legacy province/location fields
    const city = pmsProject.city || pmsProject.province || null;
    const district = pmsProject.district || null;
    const fullLocation = district ? `${city} ${district}` : city;

    // Create settings object with type and location from PMS
    const settings = JSON.stringify({
      type: pmsProject.type || null,
      city: city,
      district: district,
      province: city,
      location: fullLocation,
    });

    // Generate slug from project name
    const slug = pmsProject.name
      .toLowerCase()
      .replace(/[^a-z0-9가-힣]+/g, '-')
      .replace(/^-|-$/g, '') || `project-${pmsProjectId.substring(0, 8)}`;

    // Upsert project with full details from PMS
    await execute(
      `INSERT INTO projects (id, name, slug, logo_url, settings, region, type, province, location, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         logo_url = COALESCE(EXCLUDED.logo_url, projects.logo_url),
         settings = EXCLUDED.settings,
         region = EXCLUDED.region,
         type = EXCLUDED.type,
         province = EXCLUDED.province,
         location = EXCLUDED.location,
         is_active = EXCLUDED.is_active,
         updated_at = NOW()`,
      [
        pmsProjectId,
        pmsProject.name,
        slug,
        pmsProject.logo_url || null,
        settings,
        city,
        pmsProject.type || null,
        city,
        fullLocation,
        pmsProject.is_active
      ]
    );

    return pmsProjectId;
  }

  // Fallback: check if project exists locally
  const existingProject = await queryOne<{ id: string }>(
    'SELECT id FROM projects WHERE id = $1',
    [pmsProjectId]
  );

  if (existingProject) return existingProject.id;

  // Project doesn't exist locally and can't fetch from PMS - create a placeholder
  await execute(
    `INSERT INTO projects (id, name, slug, is_active)
     VALUES ($1, $2, $3, true)
     ON CONFLICT (id) DO NOTHING`,
    [pmsProjectId, `Project ${pmsProjectId.substring(0, 8)}`, `project-${pmsProjectId.substring(0, 8)}`]
  );

  return pmsProjectId;
}

export async function POST(request: Request) {
  try {
    // Accept either email or username
    const body = await request.json();
    const identifier = body.email || body.username; // Support both fields
    const password = body.password;

    if (!identifier || !password) {
      return NextResponse.json({ error: 'Username/email and password are required' }, { status: 400 });
    }

    // First try PMS authentication (central auth provider)
    const pmsResult = await authenticateWithPMS(identifier, password);

    // If PMS fails due to connection error, try local database authentication
    if (!pmsResult.success) {
      // Check if it's a connection error (PMS unavailable)
      const isConnectionError = pmsResult.error?.includes('fetch failed') ||
                                pmsResult.error?.includes('ECONNREFUSED') ||
                                pmsResult.error?.includes('Failed to authenticate');

      if (isConnectionError) {
        console.log('[Auth] PMS unavailable, trying local database authentication...');

        // Try local database authentication
        const localUser = await queryOne<LocalUser>(
          'SELECT id, email, password_hash FROM users WHERE email = $1',
          [identifier]
        );

        if (localUser && localUser.password_hash !== 'pms-managed') {
          const isValidPassword = await verifyPassword(password, localUser.password_hash);

          if (isValidPassword) {
            // Get local profile
            const localProfile = await queryOne<LocalProfile>(
              'SELECT id, user_id, email, role, is_active, project_id FROM profiles WHERE user_id = $1',
              [localUser.id]
            );

            if (localProfile && localProfile.is_active) {
              // Create session and set cookie
              const token = await createSession(localProfile.user_id);
              await setSessionCookie(token);

              // Set role cookie
              const cookieStore = await cookies();
              cookieStore.set('user_role', localProfile.role, {
                httpOnly: true,
                secure: false,
                sameSite: 'lax',
                maxAge: 7 * 24 * 60 * 60,
                path: '/',
              });

              const redirectUrl = (localProfile.role === 'kiosk' || localProfile.role === 'call_only') ? '/kiosk' : '/dashboard';
              console.log('[Auth] Local authentication successful for:', identifier);
              return NextResponse.json({ success: true, redirectUrl });
            }
          }
        }
      }

      return NextResponse.json({ error: pmsResult.error || 'Invalid credentials' }, { status: 401 });
    }

    const { data: pmsData } = pmsResult;
    const pmsUser = pmsData.user;

    // Map PMS role to Kiosk role
    const kioskRole = getKioskRole(pmsUser.role);

    // For super admins, sync ALL projects and kiosk users from PMS
    if (kioskRole === 'super_admin') {
      await syncAllFromPMS(pmsData.access_token);
    }

    // Sync project from PMS (create/update with full details)
    const localProjectId = await syncProjectFromPMS(pmsUser.project_id, pmsData.access_token);

    // Get or create local profile for session management
    // (we still need local profile for project assignments and local data)
    let profile = await queryOne<ProfileRow & { user_id: string }>(
      'SELECT user_id, role, is_active, project_id FROM profiles WHERE email = $1',
      [pmsUser.email]
    );

    if (!profile) {
      // Check if user exists by email (may have different local ID)
      const existingUser = await queryOne<{ id: string }>('SELECT id FROM users WHERE email = $1', [pmsUser.email]);

      // Use existing local ID if found, otherwise use PMS ID
      const userId = existingUser?.id || pmsUser.id;

      await execute(
        `INSERT INTO users (id, email, password_hash)
         VALUES ($1, $2, $3)
         ON CONFLICT (email) DO UPDATE SET
           password_hash = CASE WHEN users.password_hash = 'pms-managed' THEN 'pms-managed' ELSE users.password_hash END`,
        [userId, pmsUser.email, 'pms-managed'] // Password managed by PMS
      );

      // Insert or update profile and always get the profile ID
      profile = await queryOne<ProfileRow & { user_id: string }>(
        `INSERT INTO profiles (user_id, email, role, is_active, project_id)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (user_id) DO UPDATE SET
          role = EXCLUDED.role,
          is_active = EXCLUDED.is_active,
          email = EXCLUDED.email,
          project_id = EXCLUDED.project_id
        RETURNING id, user_id, role, is_active, project_id`,
        [userId, pmsUser.email, kioskRole, pmsUser.is_active, localProjectId]
      );

      if (!profile) {
        // This should never happen, but handle it gracefully
        console.error('Failed to create or get profile for user:', userId);
        return NextResponse.json({ error: 'Failed to create user profile' }, { status: 500 });
      }
    } else {
      // Update local profile with latest PMS role and project_id
      const updatedProfile = await queryOne<ProfileRow & { user_id: string }>(
        'UPDATE profiles SET role = $1, is_active = $2, project_id = $4 WHERE user_id = $3 RETURNING id, user_id, role, is_active, project_id',
        [kioskRole, pmsUser.is_active, profile.user_id, localProjectId]
      );
      if (updatedProfile) {
        profile = updatedProfile;
      } else {
        profile.role = kioskRole;
        profile.project_id = localProjectId;
      }
    }

    // Auto-create kiosk device ONLY for kiosk role users
    if (kioskRole === 'kiosk') {
      const existingKiosk = await queryOne(
        'SELECT id FROM kiosks WHERE profile_id = $1',
        [profile.id]
      );

      if (!existingKiosk) {
        console.log(`No kiosk found for profile ${profile.id}, attempting to auto-create...`);
        
        // Determine which project to use for the kiosk
        let kioskProjectId = localProjectId;
        
        // If no project from PMS, try to find one based on allowed regions
        if (!kioskProjectId) {
          const allowedRegions = pmsUser.allowed_regions || [];
          let project: { id: string; name: string } | null = null;
          
          if (allowedRegions.length > 0) {
            // Try to find a project in user's allowed regions
            project = await queryOne<{ id: string; name: string }>(
              `SELECT id, name FROM projects WHERE region = ANY($1::text[]) ORDER BY created_at ASC LIMIT 1`,
              [allowedRegions]
            );
          }
          
          // Fallback to any project if no region match
          if (!project) {
            project = await queryOne<{ id: string; name: string }>(
              'SELECT id, name FROM projects ORDER BY created_at ASC LIMIT 1'
            );
          }

          // If no project exists, create a default one
          if (!project) {
            console.log('No projects found, creating default project...');
            project = await queryOne<{ id: string; name: string }>(
              `INSERT INTO projects (id, name, slug, is_active) 
               VALUES (gen_random_uuid(), 'Default Hotel', 'default-hotel', true)
               ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
               RETURNING id, name`,
              []
            );
            console.log(`Created default project: ${project?.id}`);
          }
          
          if (project) {
            kioskProjectId = project.id;
          }
        }

        // Create kiosk if we have a project
        if (kioskProjectId) {
          const result = await queryOne<{ id: string }>(
            `INSERT INTO kiosks (id, project_id, profile_id, name, location, status) 
             VALUES (gen_random_uuid(), $1, $2, $3, $4, 'offline')
             ON CONFLICT DO NOTHING
             RETURNING id`,
            [
              kioskProjectId,
              profile.id,
              `${pmsUser.username || pmsUser.email} Device`,
              'Auto-created'
            ]
          );
          if (result) {
            console.log(`Auto-created kiosk ${result.id} for profile ${profile.id}`);
          }
        } else {
          console.error('Failed to create or find project for kiosk');
        }
      }
    }

    // Create local session and set cookie
    const token = await createSession(profile.user_id);
    await setSessionCookie(token);

    // Store PMS token in cookie for API validation
    const cookieStore = await cookies();
    cookieStore.set('pms_token', pmsData.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: pmsData.expires_in,
      path: '/',
    });

    // Set role cookie for middleware (for role-based routing)
    cookieStore.set('user_role', kioskRole, {
      httpOnly: true,
      secure: false, // Allow HTTP for local network access
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60, // 7 days
      path: '/',
    });

    // Set allowed_regions cookie for region-based access control
    const allowedRegions = pmsUser.allowed_regions || [];
    cookieStore.set('allowed_regions', JSON.stringify(allowedRegions), {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60, // 7 days
      path: '/',
    });

    // Redirect based on role:
    // - kiosk and call_only users go to /kiosk (the kiosk interface for guests)
    // - admin/manager users go to /dashboard
    const redirectUrl = (kioskRole === 'kiosk' || kioskRole === 'call_only') ? '/kiosk' : '/dashboard';

    return NextResponse.json({ success: true, redirectUrl });
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
