import { execute, queryOne } from '@/lib/db';
import { NextResponse } from 'next/server';
import { verifyPMSToken } from '@/lib/pms-auth';

/**
 * PMS Room Data Schema
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
 * PMS Reservation Data Schema
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
 * PMS Guest Data Schema
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
 * Complete PMS Payload
 */
interface KioskPayload {
  room: KioskRoomData;
  reservation?: KioskReservationData;
  guest?: KioskGuestData;
  sent_at: string;
  date: string;
}

/**
 * POST /api/room-details
 * Receives room and reservation data from PMS
 */
export async function POST(request: Request) {
  try {
    // Extract Bearer token from Authorization header
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Missing or invalid Authorization header' },
        { status: 401 }
      );
    }

    const token = authHeader.substring(7);

    // Verify token with PMS
    const verifyResult = await verifyPMSToken(token);
    if (!verifyResult.valid) {
      return NextResponse.json(
        { error: verifyResult.error || 'Invalid token' },
        { status: 401 }
      );
    }

    // Parse payload
    const payload: KioskPayload = await request.json();
    console.log('[Room Details] Received payload:', {
      roomId: payload.room?.id,
      roomNumber: payload.room?.room_number,
      hasReservation: !!payload.reservation,
      hasGuest: !!payload.guest,
      date: payload.date,
    });

    // Validate required fields
    if (!payload.room || !payload.room.id || !payload.room.project_id) {
      return NextResponse.json(
        { error: 'Invalid payload: room data is required' },
        { status: 400 }
      );
    }

    // Verify project exists
    const project = await queryOne<{ id: string }>(
      'SELECT id FROM projects WHERE id = $1',
      [payload.room.project_id]
    );

    if (!project) {
      return NextResponse.json(
        { error: `Project not found: ${payload.room.project_id}` },
        { status: 404 }
      );
    }

    // Process guest data first (if present) since reservation references it
    if (payload.guest) {
      await upsertGuest(payload.guest);
      console.log('[Room Details] Guest upserted:', payload.guest.id);
    }

    // Process room data
    await upsertRoom(payload.room);
    console.log('[Room Details] Room upserted:', payload.room.id);

    // Process reservation data (if present)
    if (payload.reservation) {
      await upsertReservation(payload.reservation, payload.room.id, payload.guest?.id);
      console.log('[Room Details] Reservation upserted:', payload.reservation.id);
    }

    return NextResponse.json({
      success: true,
      message: 'Room details received and processed',
      data: {
        room_id: payload.room.id,
        reservation_id: payload.reservation?.id || null,
        guest_id: payload.guest?.id || null,
        processed_at: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('[Room Details] Error processing payload:', error);
    return NextResponse.json(
      { error: 'Failed to process room details' },
      { status: 500 }
    );
  }
}

/**
 * Upsert guest data
 */
async function upsertGuest(guest: KioskGuestData): Promise<void> {
  await execute(
    `INSERT INTO guests (
      id, first_name, middle_name, last_name, email, phone_number,
      document_id, document_type, nationality, date_of_birth, gender, notes,
      created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    ON CONFLICT (id) DO UPDATE SET
      first_name = EXCLUDED.first_name,
      middle_name = EXCLUDED.middle_name,
      last_name = EXCLUDED.last_name,
      email = EXCLUDED.email,
      phone_number = EXCLUDED.phone_number,
      document_id = EXCLUDED.document_id,
      document_type = EXCLUDED.document_type,
      nationality = EXCLUDED.nationality,
      date_of_birth = EXCLUDED.date_of_birth,
      gender = EXCLUDED.gender,
      notes = EXCLUDED.notes,
      updated_at = NOW()`,
    [
      guest.id,
      guest.first_name,
      guest.middle_name || null,
      guest.last_name,
      guest.email || null,
      guest.phone_number || null,
      guest.document_id || null,
      guest.document_type || null,
      guest.nationality || null,
      guest.date_of_birth || null,
      guest.gender || null,
      guest.notes || null,
      guest.created_at,
      guest.updated_at || null,
    ]
  );
}

/**
 * Upsert room data
 */
async function upsertRoom(room: KioskRoomData): Promise<void> {
  await execute(
    `INSERT INTO rooms (
      id, project_id, room_number, room_type_id, floor, status,
      automation, security_type, key_box_number, key_box_password,
      door_password, room_password, is_day_use, is_overnight_use,
      last_cleaned, notes, is_active, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, true, $17, $18)
    ON CONFLICT (id) DO UPDATE SET
      project_id = EXCLUDED.project_id,
      room_number = EXCLUDED.room_number,
      room_type_id = EXCLUDED.room_type_id,
      floor = EXCLUDED.floor,
      status = EXCLUDED.status,
      automation = EXCLUDED.automation,
      security_type = EXCLUDED.security_type,
      key_box_number = EXCLUDED.key_box_number,
      key_box_password = EXCLUDED.key_box_password,
      door_password = EXCLUDED.door_password,
      room_password = EXCLUDED.room_password,
      is_day_use = EXCLUDED.is_day_use,
      is_overnight_use = EXCLUDED.is_overnight_use,
      last_cleaned = EXCLUDED.last_cleaned,
      notes = EXCLUDED.notes,
      updated_at = NOW()`,
    [
      room.id,
      room.project_id,
      room.room_number,
      room.room_type_id || null,
      room.floor?.toString() || null,
      room.status,
      room.automation,
      room.security_type || null,
      room.keybox_number || null,
      room.keybox_password || null,
      room.door_password || null,
      room.door_password || null, // Also store in room_password for backward compatibility
      room.is_day_use,
      room.is_overnight_use,
      room.last_cleaned || null,
      room.notes || null,
      room.created_at,
      room.updated_at || null,
    ]
  );
}

/**
 * Upsert reservation data
 */
async function upsertReservation(
  reservation: KioskReservationData,
  roomId: string,
  guestId?: string
): Promise<void> {
  // Extract date from check_in for check_in_date (legacy field)
  const checkInDate = reservation.check_in.split('T')[0];
  const checkOutDate = reservation.check_out.split('T')[0];

  // Combine first_name and last_name if we have guest data
  // This is handled by the caller which will query the guest if needed

  await execute(
    `INSERT INTO reservations (
      id, project_id, room_id, room_type_id, room_type, reservation_number,
      channel_id, channel_name, guest_id,
      check_in, check_out, check_in_date, check_out_date,
      is_day_use, adults, children, guest_count,
      status, total_amount, total_price, paid_amount,
      payment_method, payment_status, special_requests, notes,
      has_checked_in, source, created_at, updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29
    )
    ON CONFLICT (id) DO UPDATE SET
      project_id = EXCLUDED.project_id,
      room_id = EXCLUDED.room_id,
      room_type_id = EXCLUDED.room_type_id,
      room_type = EXCLUDED.room_type,
      reservation_number = EXCLUDED.reservation_number,
      channel_id = EXCLUDED.channel_id,
      channel_name = EXCLUDED.channel_name,
      guest_id = EXCLUDED.guest_id,
      check_in = EXCLUDED.check_in,
      check_out = EXCLUDED.check_out,
      check_in_date = EXCLUDED.check_in_date,
      check_out_date = EXCLUDED.check_out_date,
      is_day_use = EXCLUDED.is_day_use,
      adults = EXCLUDED.adults,
      children = EXCLUDED.children,
      guest_count = EXCLUDED.guest_count,
      status = EXCLUDED.status,
      total_amount = EXCLUDED.total_amount,
      total_price = EXCLUDED.total_price,
      paid_amount = EXCLUDED.paid_amount,
      payment_method = EXCLUDED.payment_method,
      payment_status = EXCLUDED.payment_status,
      special_requests = EXCLUDED.special_requests,
      notes = EXCLUDED.notes,
      has_checked_in = EXCLUDED.has_checked_in,
      source = EXCLUDED.source,
      updated_at = NOW()`,
    [
      reservation.id,
      reservation.project_id,
      roomId,
      null, // room_type_id - we use room_type string from PMS
      reservation.room_type || null,
      reservation.reservation_number || null,
      reservation.channel_id,
      reservation.channel_name || null,
      guestId || reservation.guest_id || null,
      reservation.check_in,
      reservation.check_out,
      checkInDate,
      checkOutDate,
      reservation.is_day_use,
      reservation.adults,
      reservation.children,
      reservation.adults + reservation.children, // guest_count = adults + children
      reservation.status,
      reservation.total_amount || null,
      reservation.total_amount || null, // Also store in total_price for backward compatibility
      reservation.paid_amount,
      reservation.payment_method || null,
      reservation.payment_status,
      reservation.special_requests || null,
      reservation.special_requests || null, // Also store in notes for backward compatibility
      reservation.has_checked_in,
      reservation.channel_name || null, // source = channel_name for backward compatibility
      reservation.created_at,
      reservation.updated_at || null,
    ]
  );

  // If we have guest data, update the denormalized guest fields on reservation
  if (guestId) {
    const guest = await queryOne<{
      first_name: string;
      last_name: string;
      phone_number: string;
      email: string;
    }>('SELECT first_name, last_name, phone_number, email FROM guests WHERE id = $1', [guestId]);

    if (guest) {
      const guestName = [guest.first_name, guest.last_name].filter(Boolean).join(' ');
      await execute(
        `UPDATE reservations SET
          guest_name = $1,
          guest_phone = $2,
          guest_email = $3
        WHERE id = $4`,
        [guestName, guest.phone_number || null, guest.email || null, reservation.id]
      );
    }
  }
}

/**
 * GET /api/room-details
 * Returns info about the endpoint
 */
export async function GET() {
  return NextResponse.json({
    endpoint: '/api/room-details',
    method: 'POST',
    description: 'Receives room and reservation data from PMS',
    authentication: 'Bearer token (PMS token)',
    payload: {
      room: 'KioskRoomData (required)',
      reservation: 'KioskReservationData (optional)',
      guest: 'KioskGuestData (optional)',
      sent_at: 'ISO datetime',
      date: 'ISO date',
    },
  });
}
