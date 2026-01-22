import { NextRequest, NextResponse } from 'next/server';
import { query, execute, queryOne } from '@/lib/db';
import { getCurrentProfile } from '@/lib/auth';

interface KioskControlRow {
  id: string;
  kiosk_id: string;
  command: string;
  payload: Record<string, unknown> | null;
  processed: boolean;
  created_at: string;
}

// POST - Send a control command to a kiosk
export async function POST(request: NextRequest) {
  try {
    const profile = await getCurrentProfile();
    if (!profile || (profile.role !== 'super_admin' && profile.role !== 'project_admin')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { kioskId, command, payload } = await request.json();

    if (!kioskId || !command) {
      return NextResponse.json({ error: 'Missing kioskId or command' }, { status: 400 });
    }

    // Insert control command
    await execute(
      `INSERT INTO kiosk_control_commands (kiosk_id, command, payload, processed)
       VALUES ($1, $2, $3, false)`,
      [kioskId, command, JSON.stringify(payload || {})]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error sending control command:', error);
    return NextResponse.json({ error: 'Failed to send command' }, { status: 500 });
  }
}

// GET - Poll for pending control commands (called by kiosk)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function GET(_request: NextRequest) {
  try {
    const profile = await getCurrentProfile();
    if (!profile || (profile.role !== 'kiosk' && profile.role !== 'call_only')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get the kiosk associated with this profile
    const kiosk = await queryOne<{ id: string }>(
      'SELECT id FROM kiosks WHERE profile_id = $1',
      [profile.id]
    );

    if (!kiosk) {
      return NextResponse.json({ error: 'Kiosk not found' }, { status: 404 });
    }

    // Get unprocessed commands for this kiosk
    const commands = await query<KioskControlRow>(
      `SELECT * FROM kiosk_control_commands 
       WHERE kiosk_id = $1 AND processed = false 
       ORDER BY created_at ASC`,
      [kiosk.id]
    );

    // Mark commands as processed
    if (commands.length > 0) {
      const commandIds = commands.map(c => c.id);
      await execute(
        `UPDATE kiosk_control_commands SET processed = true WHERE id = ANY($1::uuid[])`,
        [commandIds]
      );
    }

    return NextResponse.json({ commands });
  } catch (error) {
    console.error('Error getting control commands:', error);
    return NextResponse.json({ error: 'Failed to get commands' }, { status: 500 });
  }
}
