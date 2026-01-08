import { query, queryOne, execute } from '@/lib/db';
import { getCurrentProfile } from '@/lib/auth';
import { NextResponse } from 'next/server';

interface ReservationAmenity {
  id: string;
  reservation_id: string;
  amenity_id: string;
  quantity: number;
  unit_price: number;
  created_at: string;
  amenity_name?: string;
}

interface AmenityInput {
  amenityId: string;
  quantity: number;
  unitPrice: number;
}

export async function GET(request: Request) {
  try {
    const profile = await getCurrentProfile();

    if (!profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const reservationId = searchParams.get('reservationId');

    if (!reservationId) {
      return NextResponse.json({ error: 'Reservation ID is required' }, { status: 400 });
    }

    const data = await query<ReservationAmenity>(
      `SELECT ra.*, a.name as amenity_name
       FROM reservation_amenities ra
       JOIN amenities a ON ra.amenity_id = a.id
       WHERE ra.reservation_id = $1
       ORDER BY ra.created_at ASC`,
      [reservationId]
    );

    // Calculate total
    const total = data.reduce((sum, item) => sum + (item.unit_price * item.quantity), 0);

    return NextResponse.json({
      amenities: data,
      total
    });
  } catch (error) {
    console.error('Error fetching reservation amenities:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const profile = await getCurrentProfile();

    if (!profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { reservationId, amenities } = await request.json() as {
      reservationId: string;
      amenities: AmenityInput[];
    };

    if (!reservationId || !amenities || !Array.isArray(amenities)) {
      return NextResponse.json({
        error: 'Reservation ID and amenities array are required'
      }, { status: 400 });
    }

    // Delete existing amenities for this reservation
    await execute(
      'DELETE FROM reservation_amenities WHERE reservation_id = $1',
      [reservationId]
    );

    // Insert new amenities
    let amenityTotal = 0;
    const insertedAmenities: ReservationAmenity[] = [];

    for (const amenity of amenities) {
      if (amenity.quantity > 0) {
        const data = await queryOne<ReservationAmenity>(
          `INSERT INTO reservation_amenities (reservation_id, amenity_id, quantity, unit_price)
           VALUES ($1, $2, $3, $4)
           RETURNING *`,
          [reservationId, amenity.amenityId, amenity.quantity, amenity.unitPrice]
        );
        if (data) {
          insertedAmenities.push(data);
          amenityTotal += amenity.quantity * amenity.unitPrice;
        }
      }
    }

    // Update reservation's amenity_total
    await execute(
      'UPDATE reservations SET amenity_total = $1, updated_at = NOW() WHERE id = $2',
      [amenityTotal, reservationId]
    );

    return NextResponse.json({
      success: true,
      amenities: insertedAmenities,
      total: amenityTotal
    });
  } catch (error) {
    console.error('Error saving reservation amenities:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const profile = await getCurrentProfile();

    if (!profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (profile.role !== 'super_admin' && profile.role !== 'project_admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { reservationId } = await request.json();

    if (!reservationId) {
      return NextResponse.json({ error: 'Reservation ID is required' }, { status: 400 });
    }

    // Delete all amenities for this reservation
    await execute(
      'DELETE FROM reservation_amenities WHERE reservation_id = $1',
      [reservationId]
    );

    // Reset reservation's amenity_total
    await execute(
      'UPDATE reservations SET amenity_total = 0, updated_at = NOW() WHERE id = $1',
      [reservationId]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting reservation amenities:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
