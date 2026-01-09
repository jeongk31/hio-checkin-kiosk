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
  "Call Test": "call_test",
  "call_test": "call_test",
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
  allowed_regions: string[];  // Regions user can access (empty = all for admin)
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

/**
 * PMS Project interface matching PMS API response
 */
export interface PMSProject {
  id: string;
  name: string;
  type?: string;        // 업종: 호텔, 펜션, 캠핑, F&B, 기타
  city?: string;        // 시/도 (e.g., "제주특별자치도")
  district?: string;    // 구/군 (e.g., "제주시")
  province?: string;    // Legacy field
  location?: string;    // Legacy field
  logo_url?: string;
  is_active: boolean;
}

/**
 * Fetch project details from PMS
 */
export async function fetchPMSProject(
  projectId: string,
  token: string
): Promise<{ success: true; project: PMSProject } | { success: false; error: string }> {
  try {
    const response = await fetch(`${PMS_AUTH_URL}/api/v1/projects/${projectId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      // If we can't fetch project details, return minimal info
      return {
        success: false,
        error: 'Unable to fetch project details from PMS'
      };
    }

    const data = await response.json();
    console.log('[PMS] Single project raw response:', JSON.stringify(data).substring(0, 500));

    // Handle both direct object and nested { project: {...} } response
    const projectData = data.project || data;

    // Map PMS fields to our expected format (handle different field names)
    const project: PMSProject = {
      id: projectData.id,
      name: projectData.name,
      type: projectData.type || projectData.business_type || projectData.industry,
      city: projectData.city || projectData.province || projectData.region,
      district: projectData.district || projectData.location,
      province: projectData.province || projectData.city,
      location: projectData.location || projectData.address,
      logo_url: projectData.logo_url || projectData.logoUrl || projectData.logo,
      is_active: projectData.is_active ?? projectData.isActive ?? true,
    };

    console.log('[PMS] Mapped project:', JSON.stringify(project));
    return { success: true, project };
  } catch (error) {
    console.error('PMS project fetch error:', error);
    return {
      success: false,
      error: 'Unable to connect to PMS for project details'
    };
  }
}

/**
 * Fetch all projects from PMS (for super admins)
 */
export async function fetchAllPMSProjects(
  token: string
): Promise<{ success: true; projects: PMSProject[] } | { success: false; error: string }> {
  try {
    const url = `${PMS_AUTH_URL}/api/v1/projects`;
    console.log('[PMS] Fetching projects from:', url);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    console.log('[PMS] Projects response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[PMS] Projects fetch failed:', errorText);
      return {
        success: false,
        error: `Unable to fetch projects from PMS (${response.status})`
      };
    }

    const data = await response.json();
    console.log('[PMS] Projects raw response:', JSON.stringify(data).substring(0, 500));

    // Handle both array response and { projects: [...] } response
    const rawProjects = Array.isArray(data) ? data : (data.projects || data.data || []);

    // Map PMS fields to our expected format for each project
    const projects: PMSProject[] = rawProjects.map((p: Record<string, unknown>) => ({
      id: p.id as string,
      name: p.name as string,
      type: (p.type || p.business_type || p.industry) as string | undefined,
      city: (p.city || p.province || p.region) as string | undefined,
      district: (p.district || p.location) as string | undefined,
      province: (p.province || p.city) as string | undefined,
      location: (p.location || p.address) as string | undefined,
      logo_url: (p.logo_url || p.logoUrl || p.logo) as string | undefined,
      is_active: (p.is_active ?? p.isActive ?? true) as boolean,
    }));

    console.log('[PMS] Mapped projects sample:', projects.length > 0 ? JSON.stringify(projects[0]) : 'none');
    return { success: true, projects };
  } catch (error) {
    console.error('[PMS] Projects fetch error:', error);
    return {
      success: false,
      error: 'Unable to connect to PMS for projects'
    };
  }
}

/**
 * Fetch all kiosk users from PMS
 */
export async function fetchAllPMSKioskUsers(
  token: string
): Promise<{ success: true; users: PMSUser[] } | { success: false; error: string }> {
  try {
    // Fetch users that have kiosk system access
    const url = `${PMS_AUTH_URL}/api/v1/users?system=kiosk`;
    console.log('[PMS] Fetching kiosk users from:', url);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    console.log('[PMS] Users response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[PMS] Users fetch failed:', errorText);
      return {
        success: false,
        error: `Unable to fetch kiosk users from PMS (${response.status})`
      };
    }

    const data = await response.json();
    console.log('[PMS] Users raw response:', JSON.stringify(data).substring(0, 1000));

    // Handle both array response and { users: [...] } response
    const rawUsers = Array.isArray(data) ? data : (data.users || data.data || []);

    // Log each raw user to see exact field names
    rawUsers.forEach((u: Record<string, unknown>, idx: number) => {
      console.log(`[PMS] Raw user ${idx}:`, JSON.stringify({
        id: u.id,
        email: u.email,
        role: u.role,
        project_id: u.project_id,
        projectId: u.projectId,
        project: u.project,  // Maybe it's nested?
        allowed_systems: u.allowed_systems || u.allowedSystems,
      }));
    });

    // Map PMS fields to our expected format for each user
    const users: PMSUser[] = rawUsers.map((u: Record<string, unknown>) => {
      // Try multiple ways to get project_id
      let projectId = u.project_id || u.projectId;
      // Check if project is nested object with id
      if (!projectId && u.project && typeof u.project === 'object') {
        projectId = (u.project as Record<string, unknown>).id;
      }

      return {
        id: u.id as string,
        email: u.email as string,
        username: (u.username || u.email) as string,
        role: u.role as string | { name: string },
        role_rank: (u.role_rank || u.roleRank || 0) as number,
        allowed_systems: (u.allowed_systems || u.allowedSystems || []) as string[],
        allowed_regions: (u.allowed_regions || u.allowedRegions || []) as string[],
        project_id: (projectId || null) as string | null,
        is_active: (u.is_active ?? u.isActive ?? true) as boolean,
      };
    });

    console.log('[PMS] Mapped users:', JSON.stringify(users));
    return { success: true, users };
  } catch (error) {
    console.error('[PMS] Users fetch error:', error);
    return {
      success: false,
      error: 'Unable to connect to PMS for kiosk users'
    };
  }
}
