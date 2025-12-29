import { NextResponse } from 'next/server';

/**
 * OAuth callback route - No longer used with local authentication.
 * This route was previously used for Supabase OAuth flow.
 * 
 * Since we now use local PostgreSQL authentication, this endpoint
 * simply redirects to the login page. If you need OAuth support,
 * you'll need to implement a different OAuth provider integration.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const next = searchParams.get('next') ?? '/dashboard';
  const error = searchParams.get('error');

  // If there's an error parameter, redirect to login with error
  if (error) {
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(error)}`);
  }

  // For any OAuth callback attempts, redirect to the destination or login
  // The actual authentication is handled by /api/auth/login with local credentials
  return NextResponse.redirect(`${origin}${next}`);
}
