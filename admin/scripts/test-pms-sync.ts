/**
 * Test script to verify PMS -> Kiosk sync
 * Run with: npx ts-node scripts/test-pms-sync.ts
 */

const KIOSK_API_URL = 'http://localhost:3000/api/pms/room-details';

interface TestPayload {
  room: {
    id: string;
    project_id: string;
    room_number: string;
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
    notes?: string;
    created_at: string;
  };
  reservation?: {
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
  };
  guest?: {
    id: string;
    first_name: string;
    middle_name?: string;
    last_name: string;
    email?: string;
    phone_number?: string;
    created_at: string;
  };
  sent_at: string;
  date: string;
}

async function testSync() {
  const projectId = '229b974d-aaa0-45e4-9a74-e42de19ccb41';
  // Generate proper UUIDs
  const roomId = crypto.randomUUID();
  const reservationId = crypto.randomUUID();
  const guestId = crypto.randomUUID();
  
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  const payload: TestPayload = {
    room: {
      id: roomId,
      project_id: projectId,
      room_number: '101',
      room_type_name: 'Standard',
      floor: 1,
      status: 'reserved', // Room should be reserved when there's a reservation
      automation: false,
      security_type: 'keybox',
      keybox_number: 'KB-101',
      keybox_password: '1234',
      door_password: '5678',
      is_day_use: false,
      is_overnight_use: true,
      notes: 'Test sync from script',
      created_at: new Date().toISOString(),
    },
    reservation: {
      id: reservationId,
      project_id: projectId,
      room_id: roomId,
      channel_id: 'direct',
      channel_name: 'Direct Booking',
      guest_id: guestId,
      check_in: today.toISOString(),
      check_out: tomorrow.toISOString(),
      room_type: 'Standard',
      is_day_use: false,
      adults: 1,
      children: 0,
      status: 'confirmed',
      total_amount: 50000,
      paid_amount: 50000,
      payment_method: 'card',
      payment_status: 'paid',
      special_requests: 'Test reservation',
      has_checked_in: false,
      reservation_number: 'RES-TEST-001',
      created_at: new Date().toISOString(),
    },
    guest: {
      id: guestId,
      first_name: 'Abdelrahman',
      middle_name: 'Abdelnasser',
      last_name: 'Test',
      email: 'test@example.com',
      phone_number: '0155485346463',
      created_at: new Date().toISOString(),
    },
    sent_at: new Date().toISOString(),
    date: today.toISOString().split('T')[0],
  };

  console.log('Sending payload to kiosk:', JSON.stringify(payload, null, 2));

  try {
    const response = await fetch(KIOSK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-token',
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();
    console.log('Response status:', response.status);
    console.log('Response body:', JSON.stringify(result, null, 2));

    if (response.ok) {
      console.log('\n✅ Sync successful!');
      console.log('Room ID:', result.data?.room_id);
      console.log('Reservation ID:', result.data?.reservation_id);
    } else {
      console.log('\n❌ Sync failed:', result.error);
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

testSync();
