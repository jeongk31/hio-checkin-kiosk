import { redirect } from 'next/navigation';
import { getCurrentProfile } from '@/lib/auth';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

export default async function Home() {
  const profile = await getCurrentProfile();

  if (profile) {
    redirect('/dashboard');
  }
  
  redirect('/login');
}
