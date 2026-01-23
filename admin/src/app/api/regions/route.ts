import { query } from '@/lib/db';
import { NextResponse } from 'next/server';

// CORS headers for cross-origin requests from PMS
// Note: In production, you may want to restrict to specific origins
const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:8000',
  'http://localhost:8050',
  'http://localhost:8045',
  'https://localhost:8050',
  'https://localhost:8045',
  'https://pms.hio.ai.kr',
  'https://cctv.hio.ai.kr',
  'https://kiosk.hio.ai.kr',
];

const getCorsHeaders = (request?: Request) => {
  const origin = request?.headers.get('origin') || '*';
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Credentials': 'true',
  };
};

/**
 * OPTIONS /api/regions - Handle preflight requests
 */
export async function OPTIONS(request: Request) {
  return NextResponse.json({}, { headers: getCorsHeaders(request) });
}

/**
 * GET /api/regions
 * Returns all unique regions from projects (public endpoint for PMS)
 */
export async function GET(request: Request) {
  const corsHeaders = getCorsHeaders(request);
  try {
    // Get unique regions from projects table
    const result = await query<{ region: string; project_count: number }>(
      `SELECT 
        region, 
        COUNT(*) as project_count 
       FROM projects 
       WHERE region IS NOT NULL AND region != '' AND is_active = true
       GROUP BY region 
       ORDER BY region`
    );

    const regions = result.map((row) => ({
      code: row.region,
      name: row.region.charAt(0).toUpperCase() + row.region.slice(1), // Capitalize
      project_count: Number(row.project_count),
    }));

    return NextResponse.json({ 
      regions,
      source: 'kiosk',
    }, { headers: corsHeaders });
  } catch (error) {
    console.error('Error fetching regions:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders });
  }
}

/**
 * POST /api/regions
 * Create a new region by updating a project's region
 */
export async function POST(request: Request) {
  const corsHeaders = getCorsHeaders(request);
  try {
    const body = await request.json();
    const { code, name } = body;

    if (!code) {
      return NextResponse.json({ error: 'Region code is required' }, { status: 400, headers: corsHeaders });
    }

    // Just return success - regions are managed through projects
    return NextResponse.json({ 
      success: true,
      region: { code, name: name || code }
    }, { headers: corsHeaders });
  } catch (error) {
    console.error('Error creating region:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders });
  }
}
