import { signIn, createSession, setSessionCookie } from '@/lib/db/auth';
import { queryOne } from '@/lib/db';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

interface ProfileRow {
  role: string;
  is_active: boolean;
}

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json();

    // Sign in user
    const { userId, error: signInError } = await signIn(email, password);

    if (signInError || !userId) {
      return NextResponse.json({ error: signInError || 'Login failed' }, { status: 401 });
    }

    // Get profile to check if active and get role
    const profile = await queryOne<ProfileRow>(
      'SELECT role, is_active FROM profiles WHERE user_id = $1',
      [userId]
    );

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 403 });
    }

    if (!profile.is_active) {
      return NextResponse.json({ error: 'Account is not active' }, { status: 403 });
    }

    // Create session and set cookie
    const token = await createSession(userId);
    await setSessionCookie(token);

    // Set role cookie for middleware (for role-based routing)
    const cookieStore = await cookies();
    cookieStore.set('user_role', profile.role, {
      httpOnly: true,
      secure: false, // Allow HTTP for local network access
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60, // 7 days
      path: '/',
    });

    // Determine redirect URL based on role
    const redirectUrl = profile.role === 'kiosk' ? '/kiosk' : '/dashboard';

    return NextResponse.json({ success: true, redirectUrl });
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
