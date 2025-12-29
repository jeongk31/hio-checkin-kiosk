import { NextRequest, NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/auth';
import { queryOne, execute } from '@/lib/db';

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
