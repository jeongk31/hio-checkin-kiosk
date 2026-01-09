import { redirect } from 'next/navigation';
import { getCurrentProfile } from '@/lib/auth';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

export default async function Home() {
  try {
    const profile = await getCurrentProfile();

    if (profile) {
      // Redirect based on role
      if (profile.role === 'kiosk' || profile.role === 'call_test') {
        redirect('/kiosk');
      } else {
        redirect('/dashboard');
      }
    }
  } catch (error) {
    // If profile fetch fails (e.g., expired token), redirect to login with error
    console.error('[Home] Profile fetch failed:', error);
    redirect('/login?error=session_expired');
  }
  
  // No profile found, redirect to login
  redirect('/login');
}
