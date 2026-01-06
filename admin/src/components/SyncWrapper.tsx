'use client';

import { useEffect, createContext, useContext, useState, useCallback, useRef } from 'react';

interface SyncContextValue {
  syncNow: () => Promise<void>;
  lastSync: Date | null;
  isSyncing: boolean;
  error: string | null;
}

const SyncContext = createContext<SyncContextValue | null>(null);

export function useSyncContext() {
  return useContext(SyncContext);
}

// Sync interval in milliseconds (5 minutes)
const SYNC_INTERVAL = 5 * 60 * 1000;

/**
 * Client component that triggers PMS sync on mount and periodically
 * Used in dashboard layout to keep project/user data fresh
 * Silently fails if PMS is unavailable - sync is best effort
 */
export default function SyncWrapper({ children }: { children: React.ReactNode }) {
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const syncIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const syncFromPMS = useCallback(async (force: boolean = false) => {
    if (isSyncing) return;
    
    setIsSyncing(true);
    setError(null);
    
    try {
      const url = force ? '/api/sync?force=true' : '/api/sync';
      const response = await fetch(url, {
        method: 'POST',
        credentials: 'include',
      });
      
      if (response.ok) {
        const data = await response.json();
        if (!data.cached || force) {
          console.log('[Dashboard] Synced from PMS:', data.synced);
        }
        setLastSync(new Date());
      } else if (response.status === 401) {
        // Token expired, don't set error - let auth redirect handle it
        console.log('[Dashboard] Sync unauthorized - token may be expired');
      } else {
        const text = await response.text();
        console.error('[Dashboard] Sync failed:', response.status, text);
        setError('동기화 실패');
      }
    } catch (err) {
      console.error('[Dashboard] Sync error:', err);
      setError('PMS 연결 실패');
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing]);

  // Expose syncNow function with force=true
  const syncNow = useCallback(async () => {
    await syncFromPMS(true);
  }, [syncFromPMS]);

  // Initial sync and periodic sync
  useEffect(() => {
    // Initial sync on mount
    syncFromPMS(false);

    // Set up periodic sync
    syncIntervalRef.current = setInterval(() => {
      syncFromPMS(false);
    }, SYNC_INTERVAL);

    return () => {
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
      }
    };
  }, [syncFromPMS]);

  const contextValue: SyncContextValue = {
    syncNow,
    lastSync,
    isSyncing,
    error,
  };

  return (
    <SyncContext.Provider value={contextValue}>
      {children}
    </SyncContext.Provider>
  );
}
