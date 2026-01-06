import { execute, query } from '@/lib/db';
import { NextResponse } from 'next/server';

interface Project {
  id: string;
  name: string;
  settings: {
    daily_reset_time?: string; // Format: "HH:mm" in KST
    type?: string;
    province?: string;
    location?: string;
  } | null;
}

/**
 * Daily reset cron job
 * Clears all rooms for projects when their configured reset time is reached
 *
 * This endpoint should be called every minute by a cron job
 * Example crontab: * * * * * curl -X POST http://localhost:3000/api/cron/daily-reset
 *
 * For Vercel, add to vercel.json:
 * {
 *   "crons": [{
 *     "path": "/api/cron/daily-reset",
 *     "schedule": "* * * * *"
 *   }]
 * }
 */
export async function POST(request: Request) {
  try {
    // Optional: Verify cron secret for security
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get current time in KST (Korea Standard Time, UTC+9)
    const now = new Date();
    const kstOffset = 9 * 60; // KST is UTC+9
    const kstTime = new Date(now.getTime() + (kstOffset + now.getTimezoneOffset()) * 60000);
    const currentTime = `${kstTime.getHours().toString().padStart(2, '0')}:${kstTime.getMinutes().toString().padStart(2, '0')}`;

    console.log(`[Daily Reset] Current KST time: ${currentTime}`);

    // Get all projects with their settings
    const projects = await query<Project>(
      'SELECT id, name, settings FROM projects WHERE is_active = true'
    );

    if (!projects || projects.length === 0) {
      return NextResponse.json({ message: 'No projects found', reset: [] });
    }

    const resetResults: { projectId: string; projectName: string; roomsCleared: number }[] = [];

    for (const project of projects) {
      const resetTime = project.settings?.daily_reset_time;

      if (!resetTime) {
        console.log(`[Daily Reset] Project ${project.name}: No reset time configured`);
        continue;
      }

      // Check if current time matches reset time (within the same minute)
      if (currentTime === resetTime) {
        console.log(`[Daily Reset] Project ${project.name}: Reset time matched! Clearing rooms...`);

        // Clear all rooms for this project
        const result = await execute(
          'DELETE FROM rooms WHERE project_id = $1',
          [project.id]
        );

        const clearedCount = result?.rowCount || 0;
        console.log(`[Daily Reset] Project ${project.name}: Cleared ${clearedCount} rooms`);

        resetResults.push({
          projectId: project.id,
          projectName: project.name,
          roomsCleared: clearedCount,
        });
      }
    }

    return NextResponse.json({
      success: true,
      currentTime,
      reset: resetResults,
    });
  } catch (error) {
    console.error('[Daily Reset] Error:', error);
    return NextResponse.json({ error: 'Reset failed' }, { status: 500 });
  }
}

/**
 * GET endpoint for manual triggering or status check
 */
export async function GET() {
  try {
    // Get current time in KST
    const now = new Date();
    const kstOffset = 9 * 60;
    const kstTime = new Date(now.getTime() + (kstOffset + now.getTimezoneOffset()) * 60000);
    const currentTime = `${kstTime.getHours().toString().padStart(2, '0')}:${kstTime.getMinutes().toString().padStart(2, '0')}`;

    // Get all projects with their reset times
    const projects = await query<Project>(
      'SELECT id, name, settings FROM projects WHERE is_active = true'
    );

    const projectStatus = projects?.map(p => ({
      id: p.id,
      name: p.name,
      resetTime: p.settings?.daily_reset_time || 'Not configured',
    })) || [];

    return NextResponse.json({
      currentKSTTime: currentTime,
      projects: projectStatus,
    });
  } catch (error) {
    console.error('[Daily Reset] Status check error:', error);
    return NextResponse.json({ error: 'Failed to get status' }, { status: 500 });
  }
}
