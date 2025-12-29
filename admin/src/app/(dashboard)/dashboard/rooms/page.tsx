import { getCurrentProfile } from '@/lib/auth';
import { query, queryOne } from '@/lib/db';
import { redirect } from 'next/navigation';
import RoomManager from './RoomManager';

interface Project {
  id: string;
  name: string;
  is_active: boolean;
  settings: Record<string, unknown> | null;
  created_at: string;
}

interface RoomType {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  base_price: number;
  max_guests: number;
  is_active: boolean;
  image_url: string | null;
  code: string;
  display_order: number;
}

interface Reservation {
  id: string;
  project_id: string;
  room_type_id: string | null;
  reservation_number: string;
  guest_name: string | null;
  guest_phone: string | null;
  guest_email: string | null;
  guest_count: number;
  check_in_date: string;
  check_out_date: string;
  room_number: string | null;
  status: string;
  source: string | null;
  notes: string | null;
  total_price: number | null;
  room_type?: RoomType;
  created_at?: string;
}

interface Room {
  id: string;
  project_id: string;
  room_type_id: string | null;
  room_number: string;
  access_type: 'password' | 'card';
  room_password: string | null;
  key_box_number: string | null;
  key_box_password: string | null;
  status: string;
  floor: number | null;
  notes: string | null;
  is_active: boolean;
  room_type?: RoomType;
}

export default async function RoomsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');

  // Only project admins and super admins can access this page
  if (profile.role !== 'super_admin' && profile.role !== 'project_admin') {
    redirect('/dashboard');
  }

  // For super admin, get all projects to select from
  let projects: Project[] | null = null;
  if (profile.role === 'super_admin') {
    projects = await query<Project>(
      'SELECT * FROM projects WHERE is_active = true ORDER BY name'
    );
  }

  const targetProjectId = profile.project_id || projects?.[0]?.id;

  // Get the current project for settings
  let currentProject: Project | null = null;
  if (targetProjectId) {
    currentProject = await queryOne<Project>(
      'SELECT * FROM projects WHERE id = $1',
      [targetProjectId]
    );
  }

  // Get room types for the current project
  let roomTypes: RoomType[] | null = null;
  if (targetProjectId) {
    roomTypes = await query<RoomType>(
      'SELECT * FROM room_types WHERE project_id = $1 ORDER BY display_order',
      [targetProjectId]
    );
  }

  // Get today's reservations only
  const today = new Date().toISOString().split('T')[0];
  let reservations: Reservation[] | null = null;
  if (targetProjectId) {
    reservations = await query<Reservation>(
      `SELECT r.*, 
        json_build_object(
          'id', rt.id,
          'project_id', rt.project_id,
          'name', rt.name,
          'display_order', rt.display_order
        ) as room_type
      FROM reservations r
      LEFT JOIN room_types rt ON r.room_type_id = rt.id
      WHERE r.project_id = $1 AND r.check_in_date = $2
      ORDER BY r.created_at DESC
      LIMIT 100`,
      [targetProjectId, today]
    );
  }

  // Get individual rooms
  let rooms: Room[] | null = null;
  if (targetProjectId) {
    rooms = await query<Room>(
      `SELECT r.*, 
        json_build_object(
          'id', rt.id,
          'project_id', rt.project_id,
          'name', rt.name,
          'display_order', rt.display_order
        ) as room_type
      FROM rooms r
      LEFT JOIN room_types rt ON r.room_type_id = rt.id
      WHERE r.project_id = $1
      ORDER BY r.room_number`,
      [targetProjectId]
    );
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-8">당일 객실 관리</h1>

      <RoomManager
        projects={projects}
        defaultProjectId={targetProjectId || null}
        initialRoomTypes={roomTypes || []}
        initialReservations={reservations || []}
        initialRooms={rooms || []}
        isSuperAdmin={profile.role === 'super_admin'}
        initialProject={currentProject}
      />
    </div>
  );
}
