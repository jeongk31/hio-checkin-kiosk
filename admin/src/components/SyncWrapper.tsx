'use client';

import { useEffect } from 'react';

/**
 * Client component that triggers PMS sync on mount
 * Used in dashboard layout to keep project/user data fresh
 * Silently fails if PMS is unavailable - sync is best effort
 */
export default function SyncWrapper({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const syncFromPMS = async () => {
      try {
        const response = await fetch('/api/sync', {
          method: 'POST',
          credentials: 'include',
        });
        if (response.ok) {
          const data = await response.json();
          if (!data.cached) {
            console.log('[Dashboard] Synced from PMS:', data.synced);
          }
        }
        // Silently ignore 401 - PMS token may not be available
      } catch {
        // Silently fail - sync is best effort, don't spam console
      }
    };

    syncFromPMS();
  }, []); // Run once on mount

  return <>{children}</>;
}
