import { execute, queryOne } from '@/lib/db';
import { adminDeleteUser } from '@/lib/db/auth';
import { getCurrentProfile } from '@/lib/auth';
import { NextResponse } from 'next/server';

export async function PUT(request: Request) {
  try {
    const profile = await getCurrentProfile();

    if (!profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id, isActive, accountRole, accountProjectId } = await request.json();

    // Check permissions
    if (profile.role === 'project_admin') {
      // Project admins can only modify kiosk accounts in their project
      if (accountRole !== 'kiosk') {
        return NextResponse.json({ error: 'Project admins can only modify kiosk accounts' }, { status: 403 });
      }
      if (accountProjectId !== profile.project_id) {
        return NextResponse.json({ error: 'Cannot modify accounts from other projects' }, { status: 403 });
      }
    } else if (profile.role !== 'super_admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (!id) {
      return NextResponse.json({ error: 'Account ID is required' }, { status: 400 });
    }

    const result = await execute(
      'UPDATE profiles SET is_active = $1, updated_at = NOW() WHERE id = $2',
      [isActive, id]
    );

    if (result.rowCount === 0) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating account:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const profile = await getCurrentProfile();

    if (!profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id, accountRole, accountProjectId } = await request.json();

    // Check permissions
    if (profile.role === 'project_admin') {
      if (accountRole !== 'kiosk') {
        return NextResponse.json({ error: 'Project admins can only delete kiosk accounts' }, { status: 403 });
      }
      if (accountProjectId !== profile.project_id) {
        return NextResponse.json({ error: 'Cannot delete accounts from other projects' }, { status: 403 });
      }
    } else if (profile.role !== 'super_admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (!id) {
      return NextResponse.json({ error: 'Account ID is required' }, { status: 400 });
    }

    // Get the user_id from profile
    const profileData = await queryOne<{ user_id: string }>(
      'SELECT user_id FROM profiles WHERE id = $1',
      [id]
    );

    if (!profileData || !profileData.user_id) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    // Delete the user (this will cascade to profiles via foreign key)
    const result = await adminDeleteUser(profileData.user_id);

    if (!result.success) {
      return NextResponse.json({ error: result.error || 'Failed to delete account' }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting account:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
