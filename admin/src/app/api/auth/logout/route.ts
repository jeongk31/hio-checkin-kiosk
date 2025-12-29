import { signOut } from '@/lib/db/auth';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function POST() {
  await signOut();

  // Clear role cookie
  const cookieStore = await cookies();
  cookieStore.delete('user_role');

  return NextResponse.json({ success: true });
}

// GET handler for redirect-based logout (used by kiosk remote logout)
export async function GET(request: Request) {
  await signOut();

  // Clear all auth-related cookies
  const cookieStore = await cookies();
  cookieStore.delete('user_role');
  cookieStore.delete('session_token');

  // Create response with redirect using request URL origin
  const url = new URL('/login', request.url);
  const response = NextResponse.redirect(url);
  
  // Explicitly set cookie deletion headers with proper path and domain settings
  // This ensures cookies are cleared regardless of host (localhost vs IP)
  response.cookies.set('session_token', '', { 
    maxAge: 0,
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
  });
  response.cookies.set('user_role', '', { 
    maxAge: 0,
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
  });

  return response;
}
