import { createSession, setSessionCookie } from '@/lib/db/auth';
import { queryOne, execute } from '@/lib/db';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { authenticateWithPMS, getKioskRole } from '@/lib/pms-auth';

interface ProfileRow {
  id?: string;
  user_id: string;
  role: string;
  is_active: boolean;
  email?: string;
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

    // Authenticate against PMS (central auth provider)
    // PMS already accepts both username and email in the 'username' field
    const pmsResult = await authenticateWithPMS(identifier, password);

    if (!pmsResult.success) {
      return NextResponse.json({ error: pmsResult.error }, { status: 401 });
    }

    const { data: pmsData } = pmsResult;
    const pmsUser = pmsData.user;

    // Map PMS role to Kiosk role
    const kioskRole = getKioskRole(pmsUser.role);

    // Get or create local profile for session management
    // (we still need local profile for project assignments and local data)
    let profile = await queryOne<ProfileRow & { user_id: string }>(
      'SELECT user_id, role, is_active FROM profiles WHERE email = $1',
      [pmsUser.email]
    );

    if (!profile) {
      // Create local profile linked to PMS user
      const userId = pmsUser.id; // Use PMS user ID
      await execute(
        `INSERT INTO users (id, email, password_hash) 
         VALUES ($1, $2, $3) 
         ON CONFLICT (id) DO UPDATE SET email = $2`,
        [userId, pmsUser.email, 'pms-managed'] // Password managed by PMS
      );
      
      // Insert or update profile and always get the profile ID
      profile = await queryOne<ProfileRow & { user_id: string }>(
        `INSERT INTO profiles (user_id, email, role, is_active) 
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role, is_active = EXCLUDED.is_active, email = EXCLUDED.email
         RETURNING id, user_id, role, is_active, email`,
        [userId, pmsUser.email, kioskRole, pmsUser.is_active]
      );
      
      if (!profile) {
        // This should never happen, but handle it gracefully
        console.error('Failed to create or get profile for user:', userId);
        return NextResponse.json({ error: 'Failed to create user profile' }, { status: 500 });
      }
    } else {
      // Update local profile with latest PMS role
      const updatedProfile = await queryOne<ProfileRow & { user_id: string }>(
        'UPDATE profiles SET role = $1, is_active = $2 WHERE user_id = $3 RETURNING id, user_id, role, is_active',
        [kioskRole, pmsUser.is_active, profile.user_id]
      );
      if (updatedProfile) {
        profile = updatedProfile;
      } else {
        profile.role = kioskRole;
      }
    }

    // Auto-create kiosk device if user doesn't have one (for kiosk users)
    if (kioskRole === 'kiosk') {
      const existingKiosk = await queryOne(
        'SELECT id FROM kiosks WHERE profile_id = $1',
        [profile.id]
      );

      if (!existingKiosk) {
        console.log(`No kiosk found for profile ${profile.id}, attempting to auto-create...`);
        
        // Get first available project, prefer one matching user's allowed regions
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
          // Check if kiosk already exists for this profile (race condition check)
          const existingCheck = await queryOne<{ id: string }>(
            'SELECT id FROM kiosks WHERE profile_id = $1',
            [profile.id]
          );
          
          if (!existingCheck) {
            const result = await queryOne<{ id: string }>(
              `INSERT INTO kiosks (id, project_id, profile_id, name, location, status) 
               VALUES (gen_random_uuid(), $1, $2, $3, $4, 'offline')
               RETURNING id`,
              [
                project.id,
                profile.id,
                `${pmsUser.username || pmsUser.email} Device`,
                'Auto-created'
              ]
            );
            console.log(`Auto-created kiosk ${result?.id} for profile ${profile.id} in project ${project.name} (${project.id})`);
          } else {
            console.log(`Kiosk ${existingCheck.id} already exists for profile ${profile.id}`);
          }
        } else {
          console.error('Failed to create or find project for kiosk');
        }
      } else {
        console.log(`Kiosk already exists for profile ${profile.id}`);
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
    // - kiosk users go to /kiosk (the kiosk interface for guests)
    // - admin/manager users go to /dashboard
    const redirectUrl = kioskRole === 'kiosk' ? '/kiosk' : '/dashboard';

    return NextResponse.json({ success: true, redirectUrl });
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
