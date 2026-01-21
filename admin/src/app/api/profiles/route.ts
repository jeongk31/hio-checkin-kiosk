import { query } from '@/lib/db';
import { getCurrentProfile } from '@/lib/auth';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

interface Profile {
  id: string;
  email: string;
  role: string;
  project_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export async function GET(request: Request) {
  try {
    const profile = await getCurrentProfile();

    if (!profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');
    const role = searchParams.get('role');

    // Build dynamic query with conditions
    const conditions: string[] = ['is_active = true'];
    const params: (string | null)[] = [];
    let paramIndex = 1;

    if (projectId) {
      conditions.push(`project_id = $${paramIndex++}`);
      params.push(projectId);
    }

    if (role) {
      conditions.push(`role = $${paramIndex++}`);
      params.push(role);
    }

    // Project admins can only see profiles in their project
    if (profile.role === 'project_admin') {
      conditions.push(`project_id = $${paramIndex++}`);
      params.push(profile.project_id);
    }

    const sql = `
      SELECT * FROM profiles
      WHERE ${conditions.join(' AND ')}
      ORDER BY email
    `;

    const profiles = await query<Profile>(sql, params);

    return NextResponse.json({ profiles });
  } catch (error) {
    console.error('Error fetching profiles:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
