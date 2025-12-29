import { adminCreateUser, adminDeleteUser } from '@/lib/db/auth';
import { query, queryOne, execute } from '@/lib/db';
import { getCurrentProfile } from '@/lib/auth';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const profile = await getCurrentProfile();

    if (!profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { email, password, fullName, role, projectId } = await request.json();

    // Validate permissions
    if (profile.role === 'project_admin') {
      // Project admins can only create kiosk accounts in their project
      if (role !== 'kiosk') {
        return NextResponse.json(
          { error: 'Project admins can only create kiosk accounts' },
          { status: 403 }
        );
      }
      if (projectId !== profile.project_id) {
        return NextResponse.json(
          { error: 'Cannot create accounts for other projects' },
          { status: 403 }
        );
      }
    } else if (profile.role !== 'super_admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Create auth user
    const { user: authUser, error: authError } = await adminCreateUser(email, password);

    if (authError || !authUser) {
      return NextResponse.json({ error: authError || 'Failed to create user' }, { status: 400 });
    }

    // Insert or update the profile
    const existingProfile = await queryOne(
      'SELECT id FROM profiles WHERE user_id = $1',
      [authUser.id]
    );

    let profileData;
    if (existingProfile) {
      // Update existing profile
      const rows = await query(
        `UPDATE profiles 
         SET email = $1, full_name = $2, role = $3, project_id = $4, is_active = true
         WHERE user_id = $5
         RETURNING *`,
        [email, fullName, role, projectId || null, authUser.id]
      );
      profileData = rows[0];
    } else {
      // Insert new profile
      const rows = await query(
        `INSERT INTO profiles (user_id, email, full_name, role, project_id, is_active)
         VALUES ($1, $2, $3, $4, $5, true)
         RETURNING *`,
        [authUser.id, email, fullName, role, projectId || null]
      );
      profileData = rows[0];
    }

    if (!profileData) {
      // Cleanup: delete the auth user if profile update fails
      await adminDeleteUser(authUser.id);
      return NextResponse.json({ error: 'Failed to create profile' }, { status: 400 });
    }

    // If role is kiosk, automatically create a kiosk entry
    if (role === 'kiosk' && projectId) {
      try {
        await execute(
          `INSERT INTO kiosks (project_id, profile_id, name, status)
           VALUES ($1, $2, $3, 'offline')`,
          [projectId, (profileData as { id: string }).id, fullName || email]
        );
      } catch (kioskError) {
        console.error('Error creating kiosk:', kioskError);
        // Don't fail the whole operation, kiosk entry is supplementary
      }
    }

    return NextResponse.json({ success: true, userId: authUser.id });
  } catch (error) {
    console.error('Error creating account:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
