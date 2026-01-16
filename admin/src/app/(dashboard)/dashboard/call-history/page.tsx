import { getCurrentProfile } from '@/lib/auth';
import { query } from '@/lib/db';
import { redirect } from 'next/navigation';
import CallHistoryTable from './CallHistoryTable';

interface CallHistoryRecord {
  id: string;
  project_id: string;
  kiosk_id: string;
  staff_user_id: string | null;
  room_name: string;
  caller_type: 'kiosk' | 'manager';
  status: string;
  started_at: string;
  ended_at: string | null;
  notes: string | null;
  duration_seconds: number | null;
  kiosk: {
    id: string;
    name: string;
    location: string | null;
  } | null;
  project: {
    id: string;
    name: string;
  } | null;
  answered_by: {
    id: string;
    full_name: string | null;
    email: string;
  } | null;
}

export default async function CallHistoryPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');

  const isSuperAdmin = profile.role === 'super_admin';

  // Get call history with duration calculation
  const historySQL = `
    SELECT 
      vs.id,
      vs.project_id,
      vs.kiosk_id,
      vs.staff_user_id,
      vs.room_name,
      vs.caller_type,
      vs.status,
      vs.started_at,
      vs.ended_at,
      vs.notes,
      CASE 
        WHEN vs.ended_at IS NOT NULL 
        THEN EXTRACT(EPOCH FROM (vs.ended_at - vs.started_at))::INTEGER
        ELSE NULL
      END as duration_seconds,
      json_build_object(
        'id', k.id,
        'name', k.name,
        'location', k.location
      ) as kiosk,
      json_build_object(
        'id', p.id,
        'name', p.name
      ) as project,
      CASE 
        WHEN vs.staff_user_id IS NOT NULL 
        THEN json_build_object(
          'id', pr.id,
          'full_name', pr.full_name,
          'email', pr.email
        )
        ELSE NULL
      END as answered_by
    FROM video_sessions vs
    LEFT JOIN kiosks k ON vs.kiosk_id = k.id
    LEFT JOIN projects p ON vs.project_id = p.id
    LEFT JOIN profiles pr ON vs.staff_user_id = pr.id
    ${!isSuperAdmin ? 'WHERE vs.project_id = $1' : ''}
    ORDER BY vs.started_at DESC
    LIMIT 200
  `;
  
  const history = await query<CallHistoryRecord>(
    historySQL,
    !isSuperAdmin ? [profile.project_id] : []
  );

  // Calculate statistics
  const stats = {
    total: history?.length || 0,
    completed: history?.filter(h => h.staff_user_id !== null && h.status === 'ended').length || 0,
    missed: history?.filter(h => (h.status === 'cancelled') || (h.status === 'ended' && h.staff_user_id === null)).length || 0,
    avgDuration: 0,
  };

  const completedCalls = history?.filter(h => h.duration_seconds && h.duration_seconds > 0 && h.staff_user_id !== null) || [];
  if (completedCalls.length > 0) {
    const totalDuration = completedCalls.reduce((sum, h) => sum + (h.duration_seconds || 0), 0);
    stats.avgDuration = Math.round(totalDuration / completedCalls.length);
  }

  const formatDuration = (seconds: number | null) => {
    if (!seconds || seconds < 0) return '-';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins === 0) return `${secs}초`;
    return `${mins}분 ${secs}초`;
  };

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">📞 통화 기록</h1>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-500">전체 통화</div>
          <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-500">완료된 통화</div>
          <div className="text-2xl font-bold text-green-600">{stats.completed}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-500">부재중/취소</div>
          <div className="text-2xl font-bold text-red-600">{stats.missed}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-500">평균 통화시간</div>
          <div className="text-2xl font-bold text-blue-600">{formatDuration(stats.avgDuration)}</div>
        </div>
      </div>

      {/* Call History Table with Pagination */}
      <CallHistoryTable history={history || []} isSuperAdmin={isSuperAdmin} />
    </div>
  );
}
