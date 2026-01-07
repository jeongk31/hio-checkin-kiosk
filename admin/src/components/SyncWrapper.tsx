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
  const isSyncingRef = useRef(false); // Use ref to avoid dependency issues

  const syncFromPMS = useCallback(async (force: boolean = false) => {
    // Use ref instead of state to avoid creating new callback
    if (isSyncingRef.current) return;
    
    isSyncingRef.current = true;
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
        // Token expired - stop syncing (let middleware handle redirect)
        console.log('[Dashboard] Sync unauthorized - stopping sync. Please login again.');
        // Clear the interval to stop further attempts
        if (syncIntervalRef.current) {
          clearInterval(syncIntervalRef.current);
          syncIntervalRef.current = null;
        }
        setError('로그인이 필요합니다');
      } else {
        const text = await response.text();
        console.error('[Dashboard] Sync failed:', response.status, text);
        setError('동기화 실패');
      }
    } catch (err) {
      console.error('[Dashboard] Sync error:', err);
      setError('PMS 연결 실패');
    } finally {
      isSyncingRef.current = false;
      setIsSyncing(false);
    }
  }, []); // Empty dependency array - stable callback

  // Expose syncNow function with force=true
  const syncNow = useCallback(async () => {
    await syncFromPMS(true);
  }, [syncFromPMS]);

  // Initial sync and periodic sync
  useEffect(() => {
    // Prevent double-mounting issues in React Strict Mode
    let isMounted = true;
    
    // Initial sync on mount (but only once)
    const doInitialSync = async () => {
      if (!isMounted) return;
      console.log('[SyncWrapper] Initial sync on mount');
      await syncFromPMS(false);
    };
    
    doInitialSync();

    // Set up periodic sync (5 minutes)
    console.log('[SyncWrapper] Setting up periodic sync, interval:', SYNC_INTERVAL);
    syncIntervalRef.current = setInterval(() => {
      if (isMounted) {
        console.log('[SyncWrapper] Periodic sync triggered');
        syncFromPMS(false);
      }
    }, SYNC_INTERVAL);

    return () => {
      isMounted = false;
      console.log('[SyncWrapper] Cleanup - clearing interval');
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
        syncIntervalRef.current = null;
      }
    };
  }, []); // Empty array - run once on mount only (syncFromPMS is stable)

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
