import { getCurrentProfile } from '@/lib/auth';
import { queryOne, query, execute } from '@/lib/db';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import KioskApp from './KioskApp';
import { Kiosk } from '@/types/database';

// Force dynamic rendering to prevent hydration issues and caching
export const dynamic = 'force-dynamic';
export const revalidate = 0; // Never cache this page
export const fetchCache = 'force-no-store';

interface KioskPageProps {
  searchParams: Promise<{
    payment?: string;
    txn?: string;
    approval?: string;
    error?: string;
    message?: string;
  }>;
}

interface KioskContentRow {
  content_key: string;
  content_value: string;
}

export default async function KioskPage({ searchParams }: KioskPageProps) {
  const params = await searchParams;
  
  // Force fresh data on every request
  await headers();
  
  // Get profile - this will be null if not logged in
  const profile = await getCurrentProfile();

  // Redirect to login if no profile
  if (!profile) {
    redirect('/login');
  }

  // Only kiosk and call_test users can access this page
  if (profile.role !== 'kiosk' && profile.role !== 'call_test') {
    redirect('/dashboard');
  }

  // Get the kiosk associated with this profile
  let kiosk = await queryOne<Kiosk>(
    `SELECT * FROM kiosks WHERE profile_id = $1`,
    [profile.id]
  );

  // Auto-create kiosk device if not exists and user has a project
  if (!kiosk && profile.project_id) {
    console.log('[Kiosk] Auto-creating kiosk device for profile:', profile.id);
    await execute(
      `INSERT INTO kiosks (id, project_id, profile_id, name, location, status)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, 'offline')`,
      [profile.project_id, profile.id, `${profile.full_name || profile.email} Device`, 'Auto-created']
    );
    // Fetch the newly created kiosk
    kiosk = await queryOne<Kiosk>(
      `SELECT * FROM kiosks WHERE profile_id = $1`,
      [profile.id]
    );
  }

  if (!kiosk) {
    console.error('Kiosk not found for profile:', profile.id);
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="bg-white p-8 rounded-lg shadow-lg max-w-md text-center">
          <h1 className="text-xl font-bold text-red-600 mb-4">키오스크 오류</h1>
          <p className="text-gray-600 mb-4">
            이 계정에 연결된 키오스크를 찾을 수 없습니다.
          </p>
          <p className="text-sm text-gray-500 mb-2">
            프로필 ID: {profile.id}
          </p>
          <p className="text-sm text-gray-500 mb-4">
            프로젝트가 할당되어 있는지 확인해 주세요.
          </p>
          <a
            href="/api/auth/logout"
            className="mt-6 inline-block px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            로그아웃
          </a>
        </div>
      </div>
    );
  }

  // Fetch content for this kiosk's project
  const contentData = await query<KioskContentRow>(
    `SELECT content_key, content_value FROM kiosk_content WHERE project_id = $1`,
    [kiosk.project_id]
  );

  // Convert to a key-value map
  const content: Record<string, string> = {};
  contentData.forEach((item) => {
    content[item.content_key] = item.content_value;
  });

  // Build payment result from URL params (returned from EasyCheck app)
  const paymentResult = params.payment ? {
    status: params.payment as 'success' | 'failed',
    transactionNo: params.txn,
    approvalNum: params.approval,
    errorCode: params.error,
    errorMessage: params.message,
  } : undefined;

  return <KioskApp kiosk={kiosk} content={content} paymentResult={paymentResult} userRole={profile.role} />;
}
