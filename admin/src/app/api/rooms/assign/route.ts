import { queryOne } from '@/lib/db';
import { getCurrentProfile } from '@/lib/auth';
import { NextResponse } from 'next/server';
import { getTodayKST, getTomorrowKST } from '@/lib/timezone';

interface RoomType {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  base_price: number;
  max_guests: number;
}

interface Room {
  id: string;
  project_id: string;
  room_type_id: string;
  room_number: string;
  floor: string | null;
  status: string;
  access_type: string | null;
  room_password: string | null;
  key_box_number: string | null;
  key_box_password: string | null;
  is_active: boolean;
  room_type?: RoomType;
}

interface Reservation {
  id: string;
  project_id: string;
  room_type_id: string;
  reservation_number: string;
  guest_name: string | null;
  guest_count: number;
  check_in_date: string;
  check_out_date: string;
  room_number: string | null;
  source: string;
  status: string;
}

// Generate a unique reservation number for walk-in
function generateWalkinReservationNumber(): string {
  const dateStr = getTodayKST().replace(/-/g, '');
  const now = new Date();
  const time = now.toLocaleTimeString('en-US', { timeZone: 'Asia/Seoul', hour12: false }).replace(/:/g, '').slice(0, 4);
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `WI-${dateStr}-${time}${random}`;
}

// Assign an available room to a guest (used by kiosk during check-in)
export async function POST(request: Request) {
  try {
    const profile = await getCurrentProfile();

    if (!profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId, roomTypeId, guestName, guestCount, checkOutDate, reservationId, reservationNumber: existingReservationNumber, totalPrice, amenityTotal, paidAmount } = await request.json();

    const targetProjectId = profile.project_id || projectId;

    if (!targetProjectId) {
      return NextResponse.json({ error: 'Project ID is required' }, { status: 400 });
    }

    const today = getTodayKST();

    let room: Room | null = null;
    let existingReservation: Reservation | null = null;

    // If a reservation ID or number is provided, check for a pre-assigned reserved room
    if (reservationId || existingReservationNumber) {
      // Look up the existing reservation
      let reservationSql = 'SELECT * FROM reservations WHERE project_id = $1';
      const reservationParams: (string | null)[] = [targetProjectId];

      if (reservationId) {
        reservationSql += ' AND id = $2';
        reservationParams.push(reservationId);
      } else {
        reservationSql += ' AND reservation_number = $2';
        reservationParams.push(existingReservationNumber);
      }

      const reservationData = await queryOne<Reservation>(reservationSql, reservationParams);

      if (reservationData && reservationData.room_number) {
        existingReservation = reservationData;

        // Check if this room exists and is reserved for this reservation
        const reservedRoom = await queryOne<Room>(
          `SELECT r.*, row_to_json(rt.*) as room_type
           FROM rooms r
           LEFT JOIN room_types rt ON r.room_type_id = rt.id
           WHERE r.project_id = $1 AND r.room_number = $2 AND r.status = 'reserved' AND r.is_active = true`,
          [targetProjectId, reservationData.room_number]
        );

        if (reservedRoom) {
          room = reservedRoom;
        }
      }
    }

    // If no reserved room found, find an available room
    if (!room) {
      let availableRoomSql = `
        SELECT r.*, row_to_json(rt.*) as room_type
        FROM rooms r
        LEFT JOIN room_types rt ON r.room_type_id = rt.id
        WHERE r.project_id = $1 AND r.status = 'available' AND r.is_active = true
      `;
      const availableRoomParams: (string | null)[] = [targetProjectId];

      if (roomTypeId) {
        availableRoomSql += ' AND r.room_type_id = $2';
        availableRoomParams.push(roomTypeId);
      }

      availableRoomSql += ' ORDER BY r.room_number ASC LIMIT 1';

      const availableRoom = await queryOne<Room>(availableRoomSql, availableRoomParams);

      if (!availableRoom) {
        return NextResponse.json({
          success: false,
          error: '현재 사용 가능한 객실이 없습니다',
        });
      }

      room = availableRoom;
    }

    // Mark the room as occupied
    const updatedRoom = await queryOne<Room>(
      `UPDATE rooms SET status = 'occupied', updated_at = NOW() WHERE id = $1
       RETURNING *`,
      [room.id]
    );

    if (!updatedRoom) {
      return NextResponse.json({ error: 'Failed to update room status' }, { status: 400 });
    }

    // Get room type for the updated room
    const roomType = await queryOne<RoomType>(
      'SELECT * FROM room_types WHERE id = $1',
      [updatedRoom.room_type_id]
    );

    let reservation: Reservation | null = null;

    // If there's an existing reservation, update it to checked_in
    if (existingReservation) {
      const updatedReservation = await queryOne<Reservation>(
        `UPDATE reservations SET status = 'checked_in', room_number = $1, updated_at = NOW()
         WHERE id = $2 RETURNING *`,
        [updatedRoom.room_number, existingReservation.id]
      );

      if (updatedReservation) {
        reservation = updatedReservation;
      } else {
        console.error('Error updating reservation');
      }
    } else {
      // Create a new reservation record for this walk-in booking
      const newReservationNumber = generateWalkinReservationNumber();
      const checkInDate = today;
      const finalCheckOutDate = checkOutDate || getTomorrowKST();

      // Get room type price if totalPrice not provided
      const finalTotalPrice = totalPrice ?? (roomType?.base_price || 0);
      
      // Use the actual paid amount if provided, otherwise assume unpaid
      const finalPaidAmount = paidAmount ?? 0;

      const newReservation = await queryOne<Reservation>(
        `INSERT INTO reservations (project_id, room_type_id, reservation_number, guest_name, guest_count, check_in_date, check_out_date, room_number, source, status, total_price, amenity_total, paid_amount)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         RETURNING *`,
        [
          targetProjectId,
          updatedRoom.room_type_id,
          newReservationNumber,
          guestName || null,
          guestCount || 1,
          checkInDate,
          finalCheckOutDate,
          updatedRoom.room_number,
          'kiosk_walkin',
          'checked_in',
          finalTotalPrice,
          amenityTotal || 0,
          finalPaidAmount, // Use actual paid amount from payment
        ]
      );

      if (!newReservation) {
        console.error('Error creating reservation');
        // Room was assigned but reservation failed - still return success with warning
      } else {
        reservation = newReservation;
      }
    }

    return NextResponse.json({
      success: true,
      room: {
        id: updatedRoom.id,
        roomNumber: updatedRoom.room_number,
        accessType: updatedRoom.access_type,
        roomPassword: updatedRoom.room_password,
        keyBoxNumber: updatedRoom.key_box_number,
        keyBoxPassword: updatedRoom.key_box_password,
        floor: updatedRoom.floor,
        roomType: roomType,
      },
      reservation: reservation || null,
    });
  } catch (error) {
    console.error('Error assigning room:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
