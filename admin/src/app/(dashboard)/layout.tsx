import { redirect } from 'next/navigation';
import { getCurrentProfile } from '@/lib/auth';
import TopBar from '@/components/TopBar';
import VoiceCallWrapper from '@/components/voice-call/VoiceCallWrapper';

// Force dynamic rendering to prevent hydration issues
export const dynamic = 'force-dynamic';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getCurrentProfile();

  if (!profile) {
    redirect('/login');
  }

  // Kiosk accounts shouldn't access admin dashboard
  if (profile.role === 'kiosk') {
    redirect('/login?error=Access%20denied');
  }

  return (
    <VoiceCallWrapper profile={profile}>
      <div className="min-h-screen flex flex-col">
        <TopBar profile={profile} />
        <main className="flex-1 bg-gray-100">{children}</main>
      </div>
    </VoiceCallWrapper>
  );
}
