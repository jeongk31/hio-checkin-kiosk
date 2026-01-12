import { redirect } from 'next/navigation';
import { getCurrentProfile } from '@/lib/auth';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

export default async function Home() {
  // Middleware already validates the token, so if we reach here, user is authenticated
  // Just need to get profile for role-based redirect
  
  let profile = null;
  
  try {
    profile = await getCurrentProfile();
  } catch (error) {
    console.error('[Home] Profile fetch failed:', error);
    // Don't redirect here - middleware will handle invalid sessions
    // Just proceed with null profile
  }

  if (profile) {
    // Redirect based on role
    if (profile.role === 'kiosk' || profile.role === 'call_test') {
      redirect('/kiosk');
    } else {
      redirect('/dashboard');
    }
  }
  
  // No profile found - this shouldn't happen if middleware is working
  // But as a safety fallback, go to dashboard (middleware will catch if not authenticated)
  redirect('/dashboard');
}
