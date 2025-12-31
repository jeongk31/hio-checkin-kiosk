/**
 * PMS Authentication Client for Kiosk System
 * 
 * This module handles authentication against the central PMS server.
 * Users are managed in PMS, and Kiosk validates tokens with PMS on each request.
 */

const PMS_AUTH_URL = process.env.PMS_AUTH_URL || 'http://localhost:8000';

// Role mapping from PMS to Kiosk
const PMS_TO_KIOSK_ROLE: Record<string, string> = {
  "Super Admin": "super_admin",
  "super_admin": "super_admin",
  "Master": "super_admin",
  "master": "super_admin",
  "Team Leader": "project_admin",
  "team_leader": "project_admin",
  "Manager": "project_admin",
  "manager": "project_admin",
  "CLIENT": "project_admin",
  "client": "project_admin",
  "Project": "project_admin",
  "project": "project_admin",
  "Kiosk": "kiosk",
  "kiosk": "kiosk",
};

export function getKioskRole(pmsRole: string | { name: string }): string {
  // Extract role name if it's an object
  const roleName = typeof pmsRole === 'string' ? pmsRole : pmsRole?.name || '';
  return PMS_TO_KIOSK_ROLE[roleName] ?? "project_admin";
}

export interface PMSUser {
  id: string;
  email: string;
  username: string;
  role: string | { name: string };  // Can be string or object with name
  role_rank: number;
  allowed_systems: string[];
  project_id: string | null;
  is_active: boolean;
}

export interface PMSLoginResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  user: PMSUser;
}

export interface PMSVerifyResponse {
  valid: boolean;
  user: PMSUser;
}

/**
 * Authenticate user against PMS
 */
export async function authenticateWithPMS(
  email: string,
  password: string
): Promise<{ success: true; data: PMSLoginResponse } | { success: false; error: string }> {
  try {
    // PMS uses OAuth2 form data format
    const formData = new URLSearchParams();
    formData.append('username', email);
    formData.append('password', password);

    const response = await fetch(`${PMS_AUTH_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return { 
        success: false, 
        error: errorData.detail || 'Invalid credentials' 
      };
    }

    const data: PMSLoginResponse = await response.json();

    // Check if user can access Kiosk
    if (!data.user.allowed_systems.includes('kiosk')) {
      return { 
        success: false, 
        error: 'User not authorized to access Kiosk system' 
      };
    }

    return { success: true, data };
  } catch (error) {
    console.error('PMS auth error:', error);
    return { 
      success: false, 
      error: 'Unable to connect to authentication server' 
    };
  }
}

/**
 * Verify PMS token is still valid
 */
export async function verifyPMSToken(
  token: string
): Promise<{ valid: true; user: PMSUser } | { valid: false; error: string }> {
  try {
    const response = await fetch(`${PMS_AUTH_URL}/api/v1/auth/verify`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      return { valid: false, error: 'Token invalid or expired' };
    }

    const data: PMSVerifyResponse = await response.json();

    if (!data.valid) {
      return { valid: false, error: 'Token invalid' };
    }

    // Re-check Kiosk access
    if (!data.user.allowed_systems.includes('kiosk')) {
      return { valid: false, error: 'User no longer has Kiosk access' };
    }

    return { valid: true, user: data.user };
  } catch (error) {
    console.error('PMS token verification error:', error);
    return { valid: false, error: 'Unable to verify token' };
  }
}

/**
 * Get PMS auth URL for environment
 */
export function getPMSAuthURL(): string {
  return PMS_AUTH_URL;
}
