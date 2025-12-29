import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { query, queryOne, execute, withTransaction } from '@/lib/db';
import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production'
);
const SESSION_COOKIE_NAME = 'session_token';
const SESSION_EXPIRY_DAYS = 7;

// Types
export interface User {
  id: string;
  email: string;
  password_hash: string;
  created_at: Date;
  updated_at: Date;
}

export interface Session {
  id: string;
  user_id: string;
  token: string;
  expires_at: Date;
  created_at: Date;
}

// Password hashing
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// JWT Token generation
export async function generateToken(userId: string): Promise<string> {
  const token = await new SignJWT({ userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_EXPIRY_DAYS}d`)
    .sign(JWT_SECRET);
  return token;
}

// JWT Token verification
export async function verifyToken(token: string): Promise<{ userId: string } | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return { userId: payload.userId as string };
  } catch {
    return null;
  }
}

// Create a new user
export async function createUser(
  email: string,
  password: string
): Promise<{ user: User | null; error: string | null }> {
  try {
    // Check if user exists
    const existingUser = await queryOne<User>(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );

    if (existingUser) {
      return { user: null, error: 'User with this email already exists' };
    }

    const passwordHash = await hashPassword(password);
    const userId = crypto.randomUUID();

    const user = await queryOne<User>(
      `INSERT INTO users (id, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [userId, email, passwordHash]
    );

    return { user, error: null };
  } catch (error) {
    console.error('Error creating user:', error);
    return { user: null, error: 'Failed to create user' };
  }
}

// Sign in user
export async function signIn(
  email: string,
  password: string
): Promise<{ userId: string | null; error: string | null }> {
  try {
    const user = await queryOne<User>(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );

    if (!user) {
      return { userId: null, error: 'Invalid email or password' };
    }

    const isValid = await verifyPassword(password, user.password_hash);
    if (!isValid) {
      return { userId: null, error: 'Invalid email or password' };
    }

    return { userId: user.id, error: null };
  } catch (error) {
    console.error('Error signing in:', error);
    return { userId: null, error: 'Failed to sign in' };
  }
}

// Create session and set cookie
export async function createSession(userId: string): Promise<string> {
  const token = await generateToken(userId);
  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  await execute(
    `INSERT INTO sessions (id, user_id, token, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [sessionId, userId, token, expiresAt]
  );

  return token;
}

// Set session cookie
export async function setSessionCookie(token: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: false, // Allow HTTP for local network access
    sameSite: 'lax',
    maxAge: SESSION_EXPIRY_DAYS * 24 * 60 * 60,
    path: '/',
  });
}

// Get session from cookie
export async function getSessionFromCookie(): Promise<{ userId: string } | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!token) {
    return null;
  }

  // Verify JWT
  const payload = await verifyToken(token);
  if (!payload) {
    return null;
  }

  // Check session in database
  const session = await queryOne<Session>(
    'SELECT * FROM sessions WHERE token = $1 AND expires_at > NOW()',
    [token]
  );

  if (!session) {
    return null;
  }

  return { userId: session.user_id };
}

// Get current user ID from session
export async function getCurrentUserId(): Promise<string | null> {
  const session = await getSessionFromCookie();
  return session?.userId || null;
}

// Sign out - remove session
export async function signOut(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (token) {
    await execute('DELETE FROM sessions WHERE token = $1', [token]);
    cookieStore.delete(SESSION_COOKIE_NAME);
  }
}

// Clear expired sessions
export async function clearExpiredSessions(): Promise<void> {
  await execute('DELETE FROM sessions WHERE expires_at < NOW()');
}

// Admin functions for user management
export async function adminCreateUser(
  email: string,
  password: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _emailConfirm: boolean = true
): Promise<{ user: User | null; error: string | null }> {
  return createUser(email, password);
}

export async function adminDeleteUser(userId: string): Promise<{ success: boolean; error: string | null }> {
  try {
    await withTransaction(async (client) => {
      // Delete sessions first
      await client.query('DELETE FROM sessions WHERE user_id = $1', [userId]);
      // Delete user
      await client.query('DELETE FROM users WHERE id = $1', [userId]);
    });
    return { success: true, error: null };
  } catch (error) {
    console.error('Error deleting user:', error);
    return { success: false, error: 'Failed to delete user' };
  }
}

export async function adminListUsers(): Promise<User[]> {
  return query<User>('SELECT id, email, created_at, updated_at FROM users ORDER BY created_at DESC');
}

export async function adminGetUserByEmail(email: string): Promise<User | null> {
  return queryOne<User>('SELECT * FROM users WHERE email = $1', [email]);
}
