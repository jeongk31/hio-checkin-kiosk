import { query } from '@/lib/db';
import { getCurrentProfile } from '@/lib/auth';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

interface RoomStat {
  project_id: string;
  total_rooms: string;
  sold_rooms: string;
  available_rooms: string;
}

// GET /api/room-stats - Get room sold/available counts per project
export async function GET() {
  try {
    const profile = await getCurrentProfile();
    if (!profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let sql: string;
    let params: unknown[];

    if (profile.role === 'super_admin') {
      sql = `
        SELECT
          project_id,
          COUNT(*) as total_rooms,
          COUNT(*) FILTER (WHERE status != 'available') as sold_rooms,
          COUNT(*) FILTER (WHERE status = 'available') as available_rooms
        FROM rooms
        WHERE is_active = true
        GROUP BY project_id
      `;
      params = [];
    } else {
      sql = `
        SELECT
          project_id,
          COUNT(*) as total_rooms,
          COUNT(*) FILTER (WHERE status != 'available') as sold_rooms,
          COUNT(*) FILTER (WHERE status = 'available') as available_rooms
        FROM rooms
        WHERE is_active = true AND project_id = $1
        GROUP BY project_id
      `;
      params = [profile.project_id];
    }

    const stats = await query<RoomStat>(sql, params);

    // Convert to a map by project_id
    const statsMap: Record<string, { total: number; sold: number; available: number }> = {};
    for (const stat of (stats || [])) {
      statsMap[stat.project_id] = {
        total: parseInt(stat.total_rooms),
        sold: parseInt(stat.sold_rooms),
        available: parseInt(stat.available_rooms),
      };
    }

    return NextResponse.json({ stats: statsMap });
  } catch (error) {
    console.error('Error fetching room stats:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
