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

// Helper to clear all auth cookies
function clearAuthCookies(response: NextResponse): NextResponse {
  response.cookies.delete(SESSION_COOKIE_NAME);
  // Also try setting expired cookie to ensure deletion
  response.cookies.set(SESSION_COOKIE_NAME, '', {
    expires: new Date(0),
    path: '/',
  });
  return response;
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Skip middleware for API routes and static assets
  if (pathname.startsWith('/api') || 
      pathname.startsWith('/_next') ||
      pathname.includes('.')) {
    return NextResponse.next();
  }

  const sessionToken = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const isLoginPage = pathname === '/login';
  const hasErrorParam = request.nextUrl.searchParams.has('error');

  // RULE 1: Login page with error param - always allow and clear cookies
  if (isLoginPage && hasErrorParam) {
    const response = NextResponse.next();
    return clearAuthCookies(response);
  }

  // RULE 2: Login page without error - check if authenticated
  if (isLoginPage && !hasErrorParam) {
    if (sessionToken) {
      const payload = await verifyToken(sessionToken);
      if (payload?.userId) {
        // Valid token on login page - redirect to home
        return NextResponse.redirect(new URL('/', request.url));
      }
      // Invalid token - clear it and stay on login
      const response = NextResponse.next();
      return clearAuthCookies(response);
    }
    // No token on login page - allow
    return NextResponse.next();
  }

  // RULE 3: All other pages - must be authenticated
  if (!sessionToken) {
    // No token - redirect to login
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // Verify the token
  const payload = await verifyToken(sessionToken);
  
  if (!payload?.userId) {
    // Invalid/expired token - clear and redirect to login with error
    const response = NextResponse.redirect(
      new URL('/login?error=session_expired', request.url)
    );
    return clearAuthCookies(response);
  }

  // Valid token - allow access
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (images, etc.)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};