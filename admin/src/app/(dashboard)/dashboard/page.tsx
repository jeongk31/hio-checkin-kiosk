import { getCurrentProfile } from '@/lib/auth';
import { query, queryOne } from '@/lib/db';
import { redirect } from 'next/navigation';
import { getTodayKST } from '@/lib/timezone';

interface RecentCheckin {
  id: string;
  reservation_number: string;
  guest_name: string | null;
  guest_count: number;
  room_number: string | null;
  check_in_date: string | Date;
  created_at: string | Date;
  status: string;
}

interface CountResult {
  count: number;
}

interface PaidAmountResult {
  total_paid: number;
}

export default async function DashboardPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');

  const isSuperAdmin = profile.role === 'super_admin';
  const today = getTodayKST();

  // Fetch stats based on role
  let kioskCount = 0;
  let todayCheckins = 0;
  let totalPaidAmount = 0;
  let recentCheckins: RecentCheckin[] = [];

  if (isSuperAdmin) {
    const [kiosksResult, checkinsResult, paidResult, recent] = await Promise.all([
      queryOne<CountResult>('SELECT COUNT(*)::int as count FROM kiosks'),
      queryOne<CountResult>(
        'SELECT COUNT(*)::int as count FROM reservations WHERE status = $1 AND check_in_date = $2',
        ['checked_in', today]
      ),
      queryOne<PaidAmountResult>(
        'SELECT COALESCE(SUM(paid_amount), 0)::numeric as total_paid FROM reservations WHERE status = $1 AND check_in_date = $2',
        ['checked_in', today]
      ),
      query<RecentCheckin>(
        `SELECT id, reservation_number, guest_name, guest_count, room_number, check_in_date, created_at, status
         FROM reservations
         WHERE status = $1
         ORDER BY created_at DESC
         LIMIT 10`,
        ['checked_in']
      ),
    ]);
    kioskCount = kiosksResult?.count || 0;
    todayCheckins = checkinsResult?.count || 0;
    totalPaidAmount = Number(paidResult?.total_paid) || 0;
    recentCheckins = recent || [];
  } else {
    const [kiosksResult, checkinsResult, paidResult, recent] = await Promise.all([
      queryOne<CountResult>(
        'SELECT COUNT(*)::int as count FROM kiosks WHERE project_id = $1',
        [profile.project_id]
      ),
      queryOne<CountResult>(
        'SELECT COUNT(*)::int as count FROM reservations WHERE project_id = $1 AND status = $2 AND check_in_date = $3',
        [profile.project_id, 'checked_in', today]
      ),
      queryOne<PaidAmountResult>(
        'SELECT COALESCE(SUM(paid_amount), 0)::numeric as total_paid FROM reservations WHERE project_id = $1 AND status = $2 AND check_in_date = $3',
        [profile.project_id, 'checked_in', today]
      ),
      query<RecentCheckin>(
        `SELECT id, reservation_number, guest_name, guest_count, room_number, check_in_date, created_at, status
         FROM reservations
         WHERE project_id = $1 AND status = $2
         ORDER BY created_at DESC
         LIMIT 10`,
        [profile.project_id, 'checked_in']
      ),
    ]);
    kioskCount = kiosksResult?.count || 0;
    todayCheckins = checkinsResult?.count || 0;
    totalPaidAmount = Number(paidResult?.total_paid) || 0;
    recentCheckins = recent || [];
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-8">대시보드</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-sm text-gray-500">전체 키오스크</div>
          <div className="text-3xl font-bold text-gray-900 mt-2">{kioskCount}</div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-sm text-gray-500">오늘 체크인</div>
          <div className="text-3xl font-bold text-blue-600 mt-2">
            {todayCheckins}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-sm text-gray-500">오늘 결제 총액</div>
          <div className="text-3xl font-bold text-green-600 mt-2">
            {totalPaidAmount.toLocaleString()}원
          </div>
        </div>
      </div>

      {/* Recent Check-ins Section */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b">
          <h2 className="text-lg font-semibold text-gray-900">최근 체크인</h2>
        </div>
        <div className="p-6">
          {recentCheckins.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead>
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      예약번호
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      투숙객
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      객실
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      인원
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      체크인 날짜
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {recentCheckins.map((checkin) => (
                    <tr key={checkin.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">
                        {checkin.reservation_number}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">
                        {checkin.guest_name || '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">
                        {checkin.room_number ? `${checkin.room_number}호` : '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">
                        {checkin.guest_count}명
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {typeof checkin.check_in_date === 'string' 
                          ? checkin.check_in_date 
                          : checkin.check_in_date instanceof Date 
                            ? checkin.check_in_date.toISOString().split('T')[0]
                            : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-gray-500 text-center py-8">
              최근 체크인 기록이 없습니다
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
