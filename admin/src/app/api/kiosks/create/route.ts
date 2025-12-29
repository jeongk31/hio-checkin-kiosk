import { queryOne } from '@/lib/db';
import { getCurrentProfile } from '@/lib/auth';
import { NextResponse } from 'next/server';

interface Kiosk {
  id: string;
  name: string;
  project_id: string;
  location: string | null;
  profile_id: string | null;
  status: string;
  current_screen: string;
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export async function POST(request: Request) {
  try {
    const profile = await getCurrentProfile();

    if (!profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only super admins and project admins can create kiosks
    if (profile.role !== 'super_admin' && profile.role !== 'project_admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { name, projectId, location, profileId } = await request.json();

    // Project admins can only create kiosks for their own project
    if (profile.role === 'project_admin' && projectId !== profile.project_id) {
      return NextResponse.json({ error: 'Cannot create kiosks for other projects' }, { status: 403 });
    }

    if (!name || !projectId) {
      return NextResponse.json({ error: 'Name and project are required' }, { status: 400 });
    }

    const kiosk = await queryOne<Kiosk>(
      `INSERT INTO kiosks (name, project_id, location, profile_id, status, current_screen, settings)
       VALUES ($1, $2, $3, $4, 'offline', 'start', '{}')
       RETURNING *`,
      [name, projectId, location || null, profileId || null]
    );

    if (!kiosk) {
      return NextResponse.json({ error: 'Failed to create kiosk' }, { status: 400 });
    }

    return NextResponse.json({ success: true, kiosk });
  } catch (error) {
    console.error('Error creating kiosk:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
