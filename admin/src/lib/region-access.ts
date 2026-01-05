/**
 * Region-based access control helpers for Kiosk
 * 
 * Users have allowed_regions from PMS. Projects have a region field.
 * Empty allowed_regions = admin with access to all regions.
 */

import { cookies } from 'next/headers';

/**
 * Get allowed regions from cookie (set by middleware from PMS)
 */
export async function getAllowedRegions(): Promise<string[]> {
  const cookieStore = await cookies();
  const regionsJson = cookieStore.get('allowed_regions')?.value;
  
  if (!regionsJson) return [];
  
  try {
    const regions = JSON.parse(regionsJson);
    return Array.isArray(regions) ? regions : [];
  } catch {
    return [];
  }
}

/**
 * Check if user can access a specific region
 * Empty allowed_regions = admin with access to all
 */
export async function canAccessRegion(region: string | null): Promise<boolean> {
  const allowedRegions = await getAllowedRegions();
  
  // Empty = admin, can access all
  if (allowedRegions.length === 0) return true;
  
  // No region on project = accessible to all
  if (!region) return true;
  
  return allowedRegions.includes(region);
}

/**
 * Build SQL WHERE clause for region filtering
 * Returns empty string for admins (no filtering)
 * Returns ' AND region = ANY($N)' for non-admins
 */
export async function getRegionFilterSQL(paramIndex: number): Promise<{
  sql: string;
  params: string[];
}> {
  const allowedRegions = await getAllowedRegions();
  
  // Empty = admin, no filtering
  if (allowedRegions.length === 0) {
    return { sql: '', params: [] };
  }
  
  return {
    sql: ` AND (region IS NULL OR region = ANY($${paramIndex}))`,
    params: [allowedRegions as unknown as string], // PostgreSQL array
  };
}

/**
 * Filter projects array by allowed regions (client-side)
 */
export function filterProjectsByRegion(
  projects: Array<{ region?: string | null }>,
  allowedRegions: string[]
): typeof projects {
  // Empty = admin, return all
  if (allowedRegions.length === 0) return projects;
  
  return projects.filter(p => !p.region || allowedRegions.includes(p.region));
}
