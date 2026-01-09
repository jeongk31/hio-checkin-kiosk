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
  const pathname = request.nextUrl.pathname;

  // Skip middleware for API routes - they handle their own auth
  if (pathname.startsWith('/api')) {
    return NextResponse.next();
  }

  const sessionToken = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const isAuthPage = pathname === '/login';
  const isPublicPage = pathname === '/';
  const hasErrorParam = request.nextUrl.searchParams.has('error');

  // If login page has error parameter, clear cookies and allow access
  if (isAuthPage && hasErrorParam) {
    const response = NextResponse.next();
    // Clear session cookie
    response.cookies.delete(SESSION_COOKIE_NAME);
    return response;
  }

  // Check if user has valid local session
  let isAuthenticated = false;
  if (sessionToken) {
    const payload = await verifyToken(sessionToken);
    isAuthenticated = !!payload?.userId;
    
    // If token exists but is invalid, clear it to prevent redirect loops
    if (!isAuthenticated && !isAuthPage) {
      const response = NextResponse.redirect(new URL('/login?error=session_expired', request.url));
      response.cookies.delete(SESSION_COOKIE_NAME);
      return response;
    }
  }

  // Not authenticated - redirect to login (except for login/public pages)
  if (!isAuthenticated && !isAuthPage && !isPublicPage) {
    const response = NextResponse.redirect(new URL('/login', request.url));
    // Clear any stale cookies
    response.cookies.delete(SESSION_COOKIE_NAME);
    return response;
  }

  // Authenticated and on login page - redirect to home
  if (isAuthenticated && isAuthPage && !hasErrorParam) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};