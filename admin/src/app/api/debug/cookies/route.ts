import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/auth';

export async function GET() {
  try {
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get('session_token');
    const userRole = cookieStore.get('user_role');
    
    const profile = await getCurrentProfile();
    
    return NextResponse.json({
      cookies: {
        session_token: sessionToken ? 'present' : 'missing',
        user_role: userRole ? userRole.value : 'missing',
      },
      profile: profile ? {
        id: profile.id,
        role: profile.role,
        email: profile.email,
      } : null,
      headers: {
        cookie: cookieStore.toString(),
      }
    });
  } catch (error) {
    console.error('Debug cookies error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
