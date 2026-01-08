import { NextResponse } from 'next/server';
import { execute, queryOne } from '@/lib/db';

/**
 * Room data schema from PMS
 */
interface KioskRoomData {
  id: string;
  project_id: string;
  room_number: string;
  room_type_id?: string;
  room_type_name?: string;
  floor?: number;
  status: string;
  automation: boolean;
  security_type?: string;
  keybox_number?: string;
  keybox_password?: string;
  door_password?: string;
  is_day_use: boolean;
  is_overnight_use: boolean;
  last_cleaned?: string;
  notes?: string;
  created_at: string;
  updated_at?: string;
}

/**
 * Reservation data schema from PMS
 */
interface KioskReservationData {
  id: string;
  project_id: string;
  room_id?: string;
  channel_id: string;
  channel_name?: string;
  guest_id?: string;
  check_in: string;
  check_out: string;
  room_type?: string;
  is_day_use: boolean;
  adults: number;
  children: number;
  status: string;
  total_amount?: number;
  paid_amount: number;
  payment_method?: string;
  payment_status: string;
  special_requests?: string;
  has_checked_in: boolean;
  reservation_number?: string;
  created_at: string;
  updated_at?: string;
}

/**
 * Guest data schema from PMS
 */
interface KioskGuestData {
  id: string;
  first_name: string;
  middle_name?: string;
  last_name: string;
  email?: string;
  phone_number?: string;
  document_id?: string;
  document_type?: string;
  nationality?: string;
  date_of_birth?: string;
  gender?: string;
  notes?: string;
  created_at: string;
  updated_at?: string;
}

/**
 * Complete payload from PMS
 */
interface KioskPayload {
  room: KioskRoomData;
  reservation?: KioskReservationData;
  guest?: KioskGuestData;
  sent_at: string;
  date: string;
}

/**
 * Validate Authorization header
 * For now, accept any Bearer token - in production, validate against PMS
 */
function validateAuthToken(authHeader: string | null): boolean {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return false;
  }
  const token = authHeader.substring(7);
  // In production, validate this token against PMS
  // For now, accept any non-empty token
  return token.length > 0;
}

/**
 * Map PMS room status to KIOSK room status
 */
function mapRoomStatus(pmsStatus: string): string {
  const statusMap: Record<string, string> = {
    'available': 'available',
    'vacant': 'available',  // PMS uses 'vacant' for available rooms
    'occupied': 'occupied',
    'cleaning': 'cleaning',
    'maintenance': 'maintenance',
    'reserved': 'reserved',
    'checked_in': 'occupied',
    'checked_out': 'cleaning',
  };
  return statusMap[pmsStatus.toLowerCase()] || pmsStatus;
}

/**
 * Map PMS reservation status to KIOSK reservation status
 */
function mapReservationStatus(pmsStatus: string): string {
  const statusMap: Record<string, string> = {
    'pending': 'pending',
    'confirmed': 'confirmed',
    'checked_in': 'checked_in',
    'checked_out': 'checked_out',
    'cancelled': 'cancelled',
    'no_show': 'no_show',
  };
  return statusMap[pmsStatus.toLowerCase()] || pmsStatus;
}

/**
 * POST /api/pms/room-details
 * 
 * Receives room and reservation data from PMS
 * 
 * Request Headers:
 *   Authorization: Bearer <token>
 * 
 * Request Body: KioskPayload
 * 
 * Response:
 *   200: { success: true, message: string, data: { room_id, reservation_id?, guest_id?, processed_at } }
 *   400: { error: string }
 *   401: { error: string }
 *   404: { error: string }
 *   500: { error: string }
 */
export async function POST(request: Request) {
  const processedAt = new Date().toISOString();

  try {
    // Validate Authorization header
    const authHeader = request.headers.get('Authorization');
    if (!validateAuthToken(authHeader)) {
      return NextResponse.json(
        { error: 'Missing or invalid Authorization header' },
        { status: 401 }
      );
    }

    // Parse request body
    let payload: KioskPayload;
    try {
      payload = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON payload' },
        { status: 400 }
      );
    }

    // Validate payload
    if (!payload.room) {
      return NextResponse.json(
        { error: 'Invalid payload: room data is required' },
        { status: 400 }
      );
    }

    const { room, reservation, guest } = payload;

    // Check if project exists, auto-create if not (from PMS sync)
    const project = await queryOne<{ id: string }>(
      'SELECT id FROM projects WHERE id = $1',
      [room.project_id]
    );

    if (!project) {
      // Auto-create project from PMS data
      console.log(`[PMS Sync] Project ${room.project_id} not found, creating...`);
      try {
        // Generate a unique slug from project_id
        const slug = `pms-${room.project_id.substring(0, 8)}`;
        await execute(
          `INSERT INTO projects (id, name, slug, is_active, settings, created_at, updated_at)
           VALUES ($1, $2, $3, true, '{}', NOW(), NOW())
           ON CONFLICT (id) DO NOTHING`,
          [room.project_id, `PMS Project ${room.project_id.substring(0, 8)}`, slug]
        );
        console.log(`[PMS Sync] Created project ${room.project_id}`);
      } catch (createError) {
        console.error('[PMS Sync] Failed to create project:', createError);
        return NextResponse.json(
          { error: `Failed to create project: ${room.project_id}` },
          { status: 500 }
        );
      }
    }

    // Process room data - upsert room
    let roomTypeId: string | null = null;

    // If room_type_name is provided, find or create room type
    if (room.room_type_name) {
      const existingRoomType = await queryOne<{ id: string }>(
        'SELECT id FROM room_types WHERE project_id = $1 AND name = $2',
        [room.project_id, room.room_type_name]
      );

      if (existingRoomType) {
        roomTypeId = existingRoomType.id;
      } else {
        // Create new room type
        const newRoomType = await queryOne<{ id: string }>(
          `INSERT INTO room_types (project_id, name, is_active)
           VALUES ($1, $2, true)
           RETURNING id`,
          [room.project_id, room.room_type_name]
        );
        roomTypeId = newRoomType?.id || null;
      }
    } else if (room.room_type_id) {
      roomTypeId = room.room_type_id;
    }

    // Upsert room - use project_id + room_number as unique constraint
    // This handles the case where PMS might send different IDs for the same room
    await execute(
      `INSERT INTO rooms (
        id, project_id, room_type_id, room_number, floor, status,
        room_password, key_box_number, key_box_password, notes, is_active,
        created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true, NOW(), NOW())
      ON CONFLICT (project_id, room_number) DO UPDATE SET
        room_type_id = EXCLUDED.room_type_id,
        floor = EXCLUDED.floor,
        status = EXCLUDED.status,
        room_password = EXCLUDED.room_password,
        key_box_number = EXCLUDED.key_box_number,
        key_box_password = EXCLUDED.key_box_password,
        notes = EXCLUDED.notes,
        updated_at = NOW()`,
      [
        room.id,
        room.project_id,
        roomTypeId,
        room.room_number,
        room.floor,
        mapRoomStatus(room.status),
        room.door_password,
        room.keybox_number,
        room.keybox_password,
        room.notes,
      ]
    );

    console.log(`[PMS Sync] Room ${room.room_number} synced from PMS`);

    let reservationId: string | null = null;
    let guestId: string | null = null;

    // Process reservation data if provided
    if (reservation) {
      // Extract dates from ISO datetime strings
      const checkInDate = reservation.check_in.split('T')[0];
      const checkOutDate = reservation.check_out.split('T')[0];

      // Build guest name from guest data if available
      let guestName: string | null = null;
      let guestPhone: string | null = null;
      let guestEmail: string | null = null;

      if (guest) {
        guestName = [guest.first_name, guest.middle_name, guest.last_name]
          .filter(Boolean)
          .join(' ');
        guestPhone = guest.phone_number || null;
        guestEmail = guest.email || null;
        guestId = guest.id;
      }

      // Upsert reservation - use PMS reservation ID as primary key
      await execute(
        `INSERT INTO reservations (
          id, project_id, room_type_id, reservation_number, guest_name, guest_phone,
          guest_email, guest_count, check_in_date, check_out_date, room_number,
          status, source, notes, total_price, payment_status, data,
          created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NOW(), NOW())
        ON CONFLICT (id) DO UPDATE SET
          project_id = EXCLUDED.project_id,
          room_type_id = EXCLUDED.room_type_id,
          reservation_number = EXCLUDED.reservation_number,
          guest_name = EXCLUDED.guest_name,
          guest_phone = EXCLUDED.guest_phone,
          guest_email = EXCLUDED.guest_email,
          guest_count = EXCLUDED.guest_count,
          check_in_date = EXCLUDED.check_in_date,
          check_out_date = EXCLUDED.check_out_date,
          room_number = EXCLUDED.room_number,
          status = EXCLUDED.status,
          source = EXCLUDED.source,
          notes = EXCLUDED.notes,
          total_price = EXCLUDED.total_price,
          payment_status = EXCLUDED.payment_status,
          data = EXCLUDED.data,
          updated_at = NOW()`,
        [
          reservation.id,
          reservation.project_id,
          roomTypeId,
          reservation.reservation_number || `PMS-${reservation.id.substring(0, 8)}`,
          guestName,
          guestPhone,
          guestEmail,
          reservation.adults + reservation.children,
          checkInDate,
          checkOutDate,
          room.room_number,
          mapReservationStatus(reservation.status),
          reservation.channel_name || 'PMS',
          reservation.special_requests,
          reservation.total_amount,
          reservation.payment_status,
          JSON.stringify({
            pms_reservation_id: reservation.id,
            pms_guest_id: reservation.guest_id,
            pms_room_id: reservation.room_id,
            channel_id: reservation.channel_id,
            channel_name: reservation.channel_name,
            is_day_use: reservation.is_day_use,
            has_checked_in: reservation.has_checked_in,
            payment_method: reservation.payment_method,
            paid_amount: reservation.paid_amount,
            adults: reservation.adults,
            children: reservation.children,
          }),
        ]
      );

      reservationId = reservation.id;
      console.log(`[PMS Sync] Reservation ${reservation.reservation_number || reservation.id} synced from PMS`);
    }

    // Return success response
    return NextResponse.json({
      success: true,
      message: 'Room details received and processed',
      data: {
        room_id: room.id,
        reservation_id: reservationId,
        guest_id: guestId,
        processed_at: processedAt,
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    console.error('[PMS Sync] Error processing room details:', errorMessage);
    console.error('[PMS Sync] Stack:', errorStack);
    return NextResponse.json(
      { error: 'Failed to process room details', details: errorMessage },
      { status: 500 }
    );
  }
}

/**
 * GET /api/pms/room-details
 * 
 * Health check / documentation endpoint
 */
export async function GET() {
  return NextResponse.json({
    endpoint: '/api/pms/room-details',
    method: 'POST',
    description: 'Receives room and reservation data from PMS',
    required_headers: {
      'Authorization': 'Bearer <token>',
      'Content-Type': 'application/json',
    },
    payload_schema: {
      room: 'KioskRoomData (required)',
      reservation: 'KioskReservationData (optional)',
      guest: 'KioskGuestData (optional)',
      sent_at: 'ISO datetime string',
      date: 'ISO date string',
    },
    responses: {
      200: 'Success with processed data',
      400: 'Invalid payload',
      401: 'Unauthorized',
      404: 'Project not found',
      500: 'Server error',
    },
  });
}
