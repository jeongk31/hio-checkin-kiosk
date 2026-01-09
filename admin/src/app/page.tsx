import { redirect } from 'next/navigation';
import { getCurrentProfile } from '@/lib/auth';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

export default async function Home() {
  const profile = await getCurrentProfile();

  if (profile) {
    // Redirect based on role
    if (profile.role === 'kiosk' || profile.role === 'call_test') {
      redirect('/kiosk');
    } else {
      redirect('/dashboard');
    }
  }
  
  redirect('/login');
}
