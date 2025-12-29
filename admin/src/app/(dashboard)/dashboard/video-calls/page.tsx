import { getCurrentProfile } from '@/lib/auth';
import { query } from '@/lib/db';
import { redirect } from 'next/navigation';
import VideoCallList from './VideoCallList';

interface VideoSession {
  id: string;
  project_id: string;
  kiosk_id: string;
  staff_user_id: string | null;
  room_name: string;
  caller_type: 'kiosk' | 'manager';
  status: 'waiting' | 'connected' | 'ended';
  started_at: string;
  ended_at: string | null;
  answered_by: string | null;
  notes: string | null;
  created_at: string;
  kiosk: {
    id: string;
    name: string;
    project_id: string;
    project: {
      id: string;
      name: string;
    } | null;
  } | null;
}

export default async function VideoCallsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');

  const isSuperAdmin = profile.role === 'super_admin';

  // Get all sessions with kiosk and project info
  const sessionsSQL = `
    SELECT 
      vs.*,
      json_build_object(
        'id', k.id,
        'name', k.name,
        'project_id', k.project_id,
        'project', json_build_object('id', p.id, 'name', p.name)
      ) as kiosk
    FROM video_sessions vs
    LEFT JOIN kiosks k ON vs.kiosk_id = k.id
    LEFT JOIN projects p ON k.project_id = p.id
    ${!isSuperAdmin ? 'WHERE vs.project_id = $1' : ''}
    ORDER BY vs.started_at DESC
    LIMIT 50
  `;
  const sessions = await query<VideoSession>(
    sessionsSQL,
    !isSuperAdmin ? [profile.project_id] : []
  );

  // Get waiting sessions (calls that need attention)
  const waitingSQL = `
    SELECT 
      vs.*,
      json_build_object(
        'id', k.id,
        'name', k.name,
        'project_id', k.project_id,
        'project', json_build_object('id', p.id, 'name', p.name)
      ) as kiosk
    FROM video_sessions vs
    LEFT JOIN kiosks k ON vs.kiosk_id = k.id
    LEFT JOIN projects p ON k.project_id = p.id
    WHERE vs.status = 'waiting'
    ${!isSuperAdmin ? 'AND vs.project_id = $1' : ''}
    ORDER BY vs.started_at ASC
  `;
  const waitingSessions = await query<VideoSession>(
    waitingSQL,
    !isSuperAdmin ? [profile.project_id] : []
  );

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-8">영상통화 관리</h1>

      <VideoCallList
        sessions={sessions || []}
        waitingSessions={waitingSessions || []}
        isSuperAdmin={isSuperAdmin}
        currentProfileId={profile.id}
      />
    </div>
  );
}
