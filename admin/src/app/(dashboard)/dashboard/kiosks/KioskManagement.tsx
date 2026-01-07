'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Kiosk, KioskContent } from '@/types/database';
import ProjectSelector from '@/components/ProjectSelector';
import { useVoiceCallContext } from '@/contexts/VoiceCallContext';

interface SimpleProject {
  id: string;
  name: string;
  is_active?: boolean;
}

interface KioskManagementProps {
  projects: SimpleProject[];
  kiosks: Kiosk[];
  content: KioskContent[];
  isSuperAdmin: boolean;
  currentProjectId: string | null;
}

interface FullscreenKiosk {
  kiosk: Kiosk;
  imageData: string;
}

type GridSize = 1 | 2 | 3 | 4;

function GridIcon({ size }: { size: GridSize }) {
  const gap = 1;
  const totalSize = 18;

  // Generate grid cells based on size
  const cells = [];
  for (let i = 0; i < size; i++) {
    const width = (totalSize - (size - 1) * gap) / size;
    cells.push(
      <rect
        key={i}
        x={i * (width + gap)}
        y={0}
        width={width}
        height={totalSize}
        rx={1}
        fill="currentColor"
      />
    );
  }

  return (
    <svg width={totalSize} height={totalSize} viewBox={`0 0 ${totalSize} ${totalSize}`}>
      {cells}
    </svg>
  );
}

export default function KioskManagement({
  projects: initialProjects,
  kiosks: initialKiosks,
  isSuperAdmin,
  currentProjectId,
}: KioskManagementProps) {
  const [projects] = useState<SimpleProject[]>(initialProjects);
  const [kiosks, setKiosks] = useState<Kiosk[]>(initialKiosks);
  const [selectedProjectId, setSelectedProjectId] = useState<string>(
    isSuperAdmin ? 'all' : (currentProjectId || initialProjects[0]?.id || '')
  );
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [fullscreenKiosk, setFullscreenKiosk] = useState<FullscreenKiosk | null>(null);
  const [gridSize, setGridSize] = useState<GridSize>(2);

  // Update fullscreen image when receiving new frames
  const handleImageUpdate = useCallback((kioskId: string, imageData: string) => {
    setFullscreenKiosk((prev) => {
      if (prev && prev.kiosk.id === kioskId) {
        return { ...prev, imageData };
      }
      return prev;
    });
  }, []);

  const refreshKiosks = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const params = new URLSearchParams();
      if (selectedProjectId !== 'all') {
        params.set('projectId', selectedProjectId);
      }
      const response = await fetch(`/api/kiosks?${params.toString()}`);
      const data = await response.json();

      if (data.kiosks) {
        setKiosks(data.kiosks);
        setLastRefresh(new Date());
      }
    } catch (error) {
      console.error('Error refreshing kiosks:', error);
    }
    setIsRefreshing(false);
  }, [selectedProjectId]);

  // Polling for kiosk updates (replaces postgres_changes subscription)
  // Reduced frequency to prevent database connection exhaustion
  useEffect(() => {
    const interval = setInterval(refreshKiosks, 10000); // Every 10 seconds instead of 3
    return () => clearInterval(interval);
  }, [refreshKiosks]);

  const getProjectKiosks = (projectId: string) => {
    if (projectId === 'all') {
      return kiosks;
    }
    return kiosks.filter((k) => k.project_id === projectId);
  };

  const selectedProject = projects.find((p) => p.id === selectedProjectId);
  const projectKiosks = selectedProjectId === 'all' ? kiosks : (selectedProject ? getProjectKiosks(selectedProjectId) : []);

  return (
    <div className="h-full flex flex-col">
      <div className="bg-white border-b px-6 py-4">
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold text-gray-900">키오스크 모니터링</h1>
          </div>
          {isSuperAdmin && (
            <ProjectSelector
              projects={projects}
              selectedProjectId={selectedProjectId}
              onProjectChange={setSelectedProjectId}
              showAllOption={true}
            />
          )}
          <div className="flex items-center gap-4">
            {/* Grid Size Selector */}
            <div className="flex items-center gap-1 bg-gray-100 rounded-md p-1">
              {([1, 2, 3, 4] as GridSize[]).map((size) => (
                <button
                  key={size}
                  onClick={() => setGridSize(size)}
                  className={`p-1.5 rounded transition-colors ${
                    gridSize === size
                      ? 'bg-white shadow text-blue-600'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                  title={`${size}열 보기`}
                >
                  <GridIcon size={size} />
                </button>
              ))}
            </div>
            <span className="text-sm text-gray-500" suppressHydrationWarning>
              {lastRefresh.toLocaleTimeString('ko-KR')}
            </span>
            <button
              onClick={refreshKiosks}
              disabled={isRefreshing}
              className="flex items-center gap-2 px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-md disabled:opacity-50"
            >
              <svg
                className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              새로고침
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 p-6 overflow-auto">
        {projectKiosks.length === 0 ? (
          <div className="h-full flex items-center justify-center text-gray-500">
            등록된 키오스크가 없습니다
          </div>
        ) : (
          <div
            className={`grid gap-6 ${
              gridSize === 1
                ? 'grid-cols-1'
                : gridSize === 2
                ? 'grid-cols-1 md:grid-cols-2'
                : gridSize === 3
                ? 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3'
                : 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4'
            }`}
          >
            {projectKiosks.map((kiosk) => (
              <KioskLivePreview
                key={kiosk.id}
                kiosk={kiosk}
                onFullscreen={(imageData) => setFullscreenKiosk({ kiosk, imageData })}
                onImageUpdate={handleImageUpdate}
                isSuperAdmin={isSuperAdmin}
              />
            ))}
          </div>
        )}
      </div>

      {/* Fullscreen Modal */}
      {fullscreenKiosk && (
        <div
          className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center"
        >
          <div className="relative w-full h-full flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 bg-black/50">
              <div className="text-white">
                <h2 className="text-lg font-semibold">{fullscreenKiosk.kiosk.name}</h2>
                {fullscreenKiosk.kiosk.location && (
                  <p className="text-sm text-gray-400">{fullscreenKiosk.kiosk.location}</p>
                )}
              </div>
              <button
                onClick={() => setFullscreenKiosk(null)}
                className="text-white hover:text-gray-300 p-2"
              >
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {/* Image */}
            <div className="flex-1 flex items-center justify-center p-4 overflow-auto">
              <img
                src={fullscreenKiosk.imageData}
                alt={`${fullscreenKiosk.kiosk.name} screen`}
                className="max-w-full max-h-full object-contain"
                onClick={(e) => e.stopPropagation()}
              />
            </div>
            {/* Footer hint */}
            <div className="text-center py-3 text-gray-500 text-sm">
              클릭하여 닫기 / Click anywhere to close
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function KioskLivePreview({
  kiosk,
  onFullscreen,
  onImageUpdate,
  isSuperAdmin,
}: {
  kiosk: Kiosk;
  onFullscreen: (imageData: string) => void;
  onImageUpdate?: (kioskId: string, imageData: string) => void;
  isSuperAdmin: boolean;
}) {
  const isOnline = kiosk.status === 'online';
  const lastSeenTime = kiosk.last_seen ? new Date(kiosk.last_seen).getTime() : 0;
  const isRecentlyActive = Date.now() - lastSeenTime < 60 * 1000; // Extended to 60 seconds
  const isDbOnline = isOnline && isRecentlyActive;

  const [screenImage, setScreenImage] = useState<string | null>(null);
  const [isReceiving, setIsReceiving] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isCalling, setIsCalling] = useState(false);
  const lastFrameTimeRef = useRef<number>(0);

  // Only super_admin has access to VoiceCallContext (returns null for others)
  const voiceCallContext = useVoiceCallContext();
  const callKiosk = voiceCallContext?.callKiosk;
  const callStatus = voiceCallContext?.status ?? 'idle';
  const isInCall = callStatus !== 'idle';

  const handleCallKiosk = async () => {
    if (!callKiosk) return;
    setIsCalling(true);
    try {
      await callKiosk(kiosk.id);
    } finally {
      setIsCalling(false);
    }
  };

  const handleLogoutKiosk = async () => {
    if (!confirm(`"${kiosk.name}" 키오스크를 로그아웃하시겠습니까?`)) return;

    setIsLoggingOut(true);
    try {
      const response = await fetch('/api/kiosks/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kioskId: kiosk.id }),
      });

      if (!response.ok) {
        throw new Error('Logout failed');
      }
    } catch (error) {
      console.error('Failed to logout kiosk:', error);
      alert('키오스크 로그아웃에 실패했습니다.');
    } finally {
      setIsLoggingOut(false);
    }
  };

  // Poll for screen frames from API instead of Supabase broadcast
  useEffect(() => {
    let isActive = true;
    let lastFrameId: string | null = null;

    const pollScreenFrame = async () => {
      if (!isActive) return;
      
      try {
        const response = await fetch(`/api/kiosk-screen?kioskId=${kiosk.id}`);
        if (response.ok) {
          const data = await response.json();
          if (data.frame && data.frame.id !== lastFrameId) {
            lastFrameId = data.frame.id;
            setScreenImage(data.frame.image_data);
            setIsReceiving(true);
            lastFrameTimeRef.current = Date.now();
            // Report new image to parent for fullscreen updates
            onImageUpdate?.(kiosk.id, data.frame.image_data);
          }
        }
      } catch (error) {
        console.error(`[${kiosk.name}] Error polling screen frame:`, error);
      }
    };

    // Poll every 3 seconds for screen updates (reduced from 1s to prevent DB exhaustion)
    const pollInterval = setInterval(pollScreenFrame, 3000);
    pollScreenFrame(); // Initial poll

    // Reset receiving state if no frames for 10 seconds
    const checkInterval = setInterval(() => {
      if (isActive && lastFrameTimeRef.current > 0 && Date.now() - lastFrameTimeRef.current > 10000) {
        setIsReceiving(false);
      }
    }, 5000);

    return () => {
      isActive = false;
      clearInterval(pollInterval);
      clearInterval(checkInterval);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kiosk.id, kiosk.name]);

  // Determine actual online status: prefer stream data, fall back to DB
  const hasStream = isReceiving && screenImage;
  const isActuallyOnline = hasStream || isDbOnline;

  return (
    <div className="bg-white rounded-xl shadow-lg border overflow-hidden">
      <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-gray-900">{kiosk.name}</h3>
          {kiosk.location && (
            <p className="text-xs text-gray-500">{kiosk.location}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isActuallyOnline && (
            <>
              {/* Only super admin can call kiosks */}
              {isSuperAdmin && (
                <button
                  onClick={handleCallKiosk}
                  disabled={isCalling || isInCall}
                  className="px-2 py-1 text-xs bg-blue-50 text-blue-600 hover:bg-blue-100 rounded transition-colors disabled:opacity-50 flex items-center gap-1"
                  title={isInCall ? '통화 중' : '키오스크에 전화'}
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                  {isCalling ? '연결 중...' : '전화'}
                </button>
              )}
              <button
                onClick={handleLogoutKiosk}
                disabled={isLoggingOut}
                className="px-2 py-1 text-xs bg-red-50 text-red-600 hover:bg-red-100 rounded transition-colors disabled:opacity-50"
                title="키오스크 로그아웃"
              >
                {isLoggingOut ? '로그아웃 중...' : '로그아웃'}
              </button>
            </>
          )}
          <span
            className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
              hasStream
                ? 'bg-green-100 text-green-700'
                : isActuallyOnline
                ? 'bg-yellow-100 text-yellow-700'
                : 'bg-gray-100 text-gray-600'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full mr-1.5 ${
                hasStream
                  ? 'bg-green-500'
                  : isActuallyOnline
                  ? 'bg-yellow-500 animate-pulse'
                  : 'bg-gray-400'
              }`}
            />
            {hasStream
              ? '실시간'
              : isActuallyOnline
              ? '대기 중...'
              : '오프라인'}
          </span>
        </div>
      </div>

      {/* Tablet ratio container (4:3) */}
      <div
        className={`aspect-[4/3] relative overflow-hidden bg-gray-100 ${hasStream ? 'cursor-pointer hover:opacity-95 transition-opacity' : ''}`}
        onClick={() => hasStream && screenImage && onFullscreen(screenImage)}
      >
        {hasStream ? (
          <img
            src={screenImage}
            alt="Kiosk screen"
            className="absolute inset-0 w-full h-full object-contain"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            {isActuallyOnline ? (
              <div className="text-center text-gray-400">
                <div className="animate-pulse">
                  <svg className="w-12 h-12 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </div>
                <p className="text-sm">스트림 대기 중...</p>
              </div>
            ) : (
              <div className="text-center text-gray-500">
                <svg className="w-16 h-16 mx-auto mb-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                <p className="text-sm">오프라인</p>
                <p className="text-xs text-gray-400 mt-1" suppressHydrationWarning>
                  {kiosk.last_seen
                    ? new Date(kiosk.last_seen).toLocaleString('ko-KR', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : '접속 기록 없음'}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
