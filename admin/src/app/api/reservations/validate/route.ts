import { queryOne } from '@/lib/db';
import { getCurrentProfile } from '@/lib/auth';
import { NextResponse } from 'next/server';

interface Reservation {
  id: string;
  reservation_number: string;
  guest_name: string;
  guest_phone: string | null;
  guest_email: string | null;
  guest_count: number;
  check_in_date: string;
  check_out_date: string;
  room_number: string | null;
  room_type: string | null;
  room_type_id: string | null;
  source: string | null;
  status: string;
}

// This endpoint is used by kiosks to validate reservation numbers during check-in
export async function POST(request: Request) {
  try {
    const profile = await getCurrentProfile();

    if (!profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { reservationNumber, projectId } = await request.json();

    if (!reservationNumber) {
      return NextResponse.json({ error: 'Reservation number is required' }, { status: 400 });
    }

    const targetProjectId = profile.project_id || projectId;

    if (!targetProjectId) {
      return NextResponse.json({ error: 'Project ID is required' }, { status: 400 });
    }

    console.log('[Reservation Validate] Searching for reservation:', {
      reservationNumber,
      targetProjectId,
      profileProjectId: profile.project_id,
      passedProjectId: projectId,
    });

    // Look up the reservation
    const reservation = await queryOne<Reservation>(
      `SELECT r.*, rt.name as room_type_name
       FROM reservations r
       LEFT JOIN room_types rt ON r.room_type_id = rt.id
       WHERE r.project_id = $1 AND r.reservation_number = $2`,
      [targetProjectId, reservationNumber]
    );

    console.log('[Reservation Validate] Query result:', reservation ? {
      id: reservation.id,
      reservation_number: reservation.reservation_number,
      status: reservation.status,
      check_in_date: reservation.check_in_date,
      check_out_date: reservation.check_out_date,
    } : 'NOT FOUND');

    if (!reservation) {
      return NextResponse.json({
        valid: false,
        error: '예약을 찾을 수 없습니다. 예약번호를 확인해 주세요.',
      });
    }

    // Check if reservation is already checked in
    if (reservation.status === 'checked_in') {
      return NextResponse.json({
        valid: false,
        error: '이미 체크인된 예약입니다.',
      });
    }

    // Check if reservation is cancelled
    if (reservation.status === 'cancelled') {
      return NextResponse.json({
        valid: false,
        error: '취소된 예약입니다.',
      });
    }

    // Check if check-in date is today or in the past (allow early check-in on the day of)
    const today = new Date().toISOString().split('T')[0];
    const checkInDate = reservation.check_in_date;

    if (checkInDate > today) {
      return NextResponse.json({
        valid: false,
        error: `체크인 날짜가 아직 되지 않았습니다. (체크인 날짜: ${checkInDate})`,
      });
    }

    // Reservation is valid
    return NextResponse.json({
      valid: true,
      reservation: {
        id: reservation.id,
        reservationNumber: reservation.reservation_number,
        guestName: reservation.guest_name,
        guestPhone: reservation.guest_phone,
        guestEmail: reservation.guest_email,
        guestCount: reservation.guest_count,
        checkInDate: reservation.check_in_date,
        checkOutDate: reservation.check_out_date,
        roomNumber: reservation.room_number,
        roomType: reservation.room_type,
        source: reservation.source,
      },
    });
  } catch (error) {
    console.error('Error validating reservation:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
