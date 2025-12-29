import { query, execute } from '@/lib/db';
import { NextResponse } from 'next/server';

interface SignalingMessage {
  id: number;
  session_id: string;
  payload: Record<string, unknown>;
  created_at: string;
}

// GET - Poll for messages
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');
    const lastId = parseInt(searchParams.get('lastId') || '0', 10);

    if (!sessionId) {
      return NextResponse.json({ error: 'Session ID is required' }, { status: 400 });
    }

    // Get messages newer than lastId
    const messages = await query<SignalingMessage>(
      `SELECT * FROM signaling_messages 
       WHERE session_id = $1 AND id > $2 
       ORDER BY id ASC 
       LIMIT 10`,
      [sessionId, lastId]
    );

    return NextResponse.json({ messages });
  } catch (error) {
    console.error('Error fetching signaling messages:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST - Send a message
export async function POST(request: Request) {
  try {
    const { sessionId, payload } = await request.json();

    if (!sessionId || !payload) {
      return NextResponse.json({ error: 'Session ID and payload are required' }, { status: 400 });
    }

    // Insert message
    await execute(
      `INSERT INTO signaling_messages (session_id, payload) VALUES ($1, $2)`,
      [sessionId, JSON.stringify(payload)]
    );

    // Cleanup old messages (older than 5 minutes)
    await execute(
      `DELETE FROM signaling_messages WHERE created_at < NOW() - INTERVAL '5 minutes'`
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error sending signaling message:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE - Clean up session messages
export async function DELETE(request: Request) {
  try {
    const { sessionId } = await request.json();

    if (!sessionId) {
      return NextResponse.json({ error: 'Session ID is required' }, { status: 400 });
    }

    await execute('DELETE FROM signaling_messages WHERE session_id = $1', [sessionId]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting signaling messages:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
