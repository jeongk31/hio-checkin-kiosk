/**
 * Timezone utility functions for Korean Standard Time (KST)
 * All dates in the kiosk should use KST (Asia/Seoul, UTC+9)
 */

const KST_TIMEZONE = 'Asia/Seoul';

/**
 * Get today's date in Korean Standard Time (Asia/Seoul) as YYYY-MM-DD string
 * 
 * @returns Today's date string in KST timezone (format: YYYY-MM-DD)
 * 
 * @example
 * // If current time is 2025-12-29 01:00 UTC (which is 2025-12-29 10:00 KST)
 * getTodayKST() // Returns "2025-12-29"
 */
export function getTodayKST(): string {
  const now = new Date();
  // Use Intl.DateTimeFormat to get date components in KST timezone
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: KST_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  
  // Format returns YYYY-MM-DD directly
  return formatter.format(now);
}

/**
 * Get current date and time in KST as ISO string
 * 
 * @returns ISO datetime string in KST
 */
export function getNowKST(): Date {
  const now = new Date();
  // Create a date string in KST
  const kstString = now.toLocaleString('en-US', { timeZone: KST_TIMEZONE });
  return new Date(kstString);
}

/**
 * Get current datetime in KST as ISO string
 * 
 * @returns ISO datetime string
 */
export function getNowKSTISOString(): string {
  return new Date().toLocaleString('sv-SE', { timeZone: KST_TIMEZONE }).replace(' ', 'T');
}

/**
 * Format a date to YYYY-MM-DD in KST timezone
 * 
 * @param date - Date to format
 * @returns Date string in YYYY-MM-DD format
 */
export function formatDateKST(date: Date): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: KST_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(date);
}

/**
 * Format a date to localized Korean datetime string
 * 
 * @param date - Date to format
 * @returns Localized datetime string (e.g., "2025. 12. 29. 오후 3:00:00")
 */
export function formatDateTimeKST(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString('ko-KR', { timeZone: KST_TIMEZONE });
}

/**
 * Format a date to short Korean datetime string
 * 
 * @param date - Date to format
 * @returns Short datetime string (e.g., "12/29 15:00")
 */
export function formatShortDateTimeKST(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString('ko-KR', {
    timeZone: KST_TIMEZONE,
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/**
 * Get tomorrow's date in KST as YYYY-MM-DD string
 * 
 * @returns Tomorrow's date string in KST timezone
 */
export function getTomorrowKST(): string {
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  return formatDateKST(tomorrow);
}

/**
 * Check if a date is today in KST
 * 
 * @param date - Date to check (string or Date)
 * @returns true if the date is today in KST
 */
export function isTodayKST(date: Date | string): boolean {
  const d = typeof date === 'string' ? new Date(date) : date;
  return formatDateKST(d) === getTodayKST();
}

export { KST_TIMEZONE };
