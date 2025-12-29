import { type NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production'
);
const SESSION_COOKIE_NAME = 'session_token';

async function verifyToken(token: string): Promise<{ userId: string } | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return { userId: payload.userId as string };
  } catch {
    return null;
  }
}

export async function middleware(request: NextRequest) {
  const response = NextResponse.next({ request });

  const sessionToken = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const isAuthPage = request.nextUrl.pathname === '/login';
  const isPublicPage = request.nextUrl.pathname === '/';
  const isApiRoute = request.nextUrl.pathname.startsWith('/api');
  const isKioskRoute = request.nextUrl.pathname.startsWith('/kiosk');
  const isDashboardRoute = request.nextUrl.pathname.startsWith('/dashboard');

  // Skip middleware for API routes - they handle their own auth
  if (isApiRoute) {
    return response;
  }

  // Check if user has valid session
  let userId: string | null = null;
  if (sessionToken) {
    const payload = await verifyToken(sessionToken);
    userId = payload?.userId || null;
  }

  // If not logged in and trying to access protected route, redirect to login
  if (!userId && !isAuthPage && !isPublicPage) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    const redirectResponse = NextResponse.redirect(url);
    // Clear any stale cookies
    redirectResponse.cookies.set('session_token', '', { maxAge: 0 });
    redirectResponse.cookies.set('user_role', '', { maxAge: 0 });
    return redirectResponse;
  }

  // If logged in, check user role from cookie
  if (userId) {
    const userRole = request.cookies.get('user_role')?.value;

    // If no role cookie but we have userId, something is wrong - clear session and redirect
    if (!userRole) {
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      const redirectResponse = NextResponse.redirect(url);
      redirectResponse.cookies.set('session_token', '', { maxAge: 0 });
      redirectResponse.cookies.set('user_role', '', { maxAge: 0 });
      return redirectResponse;
    }

    const isKioskUser = userRole === 'kiosk';

    // Redirect kiosk users trying to access dashboard to kiosk
    if (isKioskUser && isDashboardRoute) {
      const url = request.nextUrl.clone();
      url.pathname = '/kiosk';
      return NextResponse.redirect(url);
    }

    // Redirect admin/project_admin users trying to access kiosk to dashboard
    if (!isKioskUser && userRole && isKioskRoute) {
      const url = request.nextUrl.clone();
      url.pathname = '/dashboard';
      return NextResponse.redirect(url);
    }

    // Redirect from login page based on role
    if (isAuthPage && userRole) {
      const url = request.nextUrl.clone();
      url.pathname = isKioskUser ? '/kiosk' : '/dashboard';
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
