'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { VideoSession } from '@/types/database';

interface VideoCallListProps {
  sessions: VideoSession[];
  waitingSessions: VideoSession[];
  isSuperAdmin: boolean;
  currentProfileId: string;
}

export default function VideoCallList({
  sessions: initialSessions,
  waitingSessions: initialWaitingSessions,
  isSuperAdmin,
  currentProfileId,
}: VideoCallListProps) {
  const [waitingSessions, setWaitingSessions] = useState(initialWaitingSessions);
  const [sessions, setSessions] = useState(initialSessions);
  const lastCheckRef = useRef<string>(new Date().toISOString());

  // Poll for real-time updates
  const fetchUpdates = useCallback(async () => {
    try {
      const response = await fetch(`/api/video-sessions?since=${encodeURIComponent(lastCheckRef.current)}`);
      if (response.ok) {
        const data = await response.json();
        lastCheckRef.current = new Date().toISOString();
        
        if (data.waitingSessions) {
          setWaitingSessions(data.waitingSessions);
        }
        if (data.sessions) {
          setSessions(data.sessions);
        }
      }
    } catch (error) {
      console.error('Error fetching video session updates:', error);
    }
  }, []);

  useEffect(() => {
    // Poll every 3 seconds for updates
    const interval = setInterval(fetchUpdates, 3000);
    
    return () => {
      clearInterval(interval);
    };
  }, [fetchUpdates]);

  const handleJoinCall = async (session: VideoSession) => {
    try {
      const response = await fetch('/api/video-sessions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: session.id,
          status: 'connected',
          staffUserId: currentProfileId,
        }),
      });

      if (response.ok) {
        // Open Jitsi in new window
        window.open(
          `https://meet.jit.si/${session.room_name}`,
          'video-call',
          'width=800,height=600'
        );
      }
    } catch (error) {
      console.error('Error joining call:', error);
    }
  };

  const handleEndCall = async (session: VideoSession) => {
    try {
      const response = await fetch('/api/video-sessions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: session.id,
          status: 'ended',
          endedAt: new Date().toISOString(),
        }),
      });

      if (response.ok) {
        setSessions((prev) =>
          prev.map((s) =>
            s.id === session.id ? { ...s, status: 'ended' as const } : s
          )
        );
      }
    } catch (error) {
      console.error('Error ending call:', error);
    }
  };

  const statusLabels: Record<string, { label: string; class: string }> = {
    waiting: { label: '대기중', class: 'bg-yellow-100 text-yellow-800' },
    connected: { label: '통화중', class: 'bg-green-100 text-green-800' },
    ended: { label: '종료', class: 'bg-gray-100 text-gray-800' },
  };

  return (
    <div>
      {/* Waiting calls */}
      {waitingSessions.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-red-600 mb-4 flex items-center gap-2">
            <span className="animate-pulse">●</span>
            대기 중인 통화 ({waitingSessions.length})
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {waitingSessions.map((session) => (
              <div
                key={session.id}
                className="bg-white border-2 border-yellow-400 rounded-lg p-4 shadow-lg"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="font-medium">
                    {(session.kiosk as { name?: string })?.name || '키오스크'}
                  </span>
                  <span className="px-2 py-1 text-xs bg-yellow-100 text-yellow-800 rounded-full animate-pulse">
                    대기중
                  </span>
                </div>
                {isSuperAdmin && (session.kiosk as { project?: { name?: string } })?.project && (
                  <p className="text-sm text-gray-500 mb-2">
                    {(session.kiosk as { project?: { name?: string } }).project?.name}
                  </p>
                )}
                <p className="text-xs text-gray-400 mb-4">
                  {new Date(session.started_at).toLocaleString('ko-KR')}
                </p>
                <button
                  onClick={() => handleJoinCall(session)}
                  className="w-full py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                >
                  통화 연결
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent sessions */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b">
          <h2 className="text-lg font-semibold">최근 통화 기록</h2>
        </div>
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                키오스크
              </th>
              {isSuperAdmin && (
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  프로젝트
                </th>
              )}
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                상태
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                시작 시간
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                종료 시간
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                작업
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {sessions.map((session) => {
              const status = statusLabels[session.status];
              return (
                <tr key={session.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {(session.kiosk as { name?: string })?.name || '-'}
                  </td>
                  {isSuperAdmin && (
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {(session.kiosk as { project?: { name?: string } })?.project?.name || '-'}
                    </td>
                  )}
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs rounded-full ${status.class}`}>
                      {status.label}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(session.started_at).toLocaleString('ko-KR')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {session.ended_at
                      ? new Date(session.ended_at).toLocaleString('ko-KR')
                      : '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                    {session.status === 'connected' && (
                      <button
                        onClick={() => handleEndCall(session)}
                        className="text-red-600 hover:text-red-800"
                      >
                        통화 종료
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {sessions.length === 0 && (
              <tr>
                <td
                  colSpan={isSuperAdmin ? 6 : 5}
                  className="px-6 py-12 text-center text-gray-500"
                >
                  통화 기록이 없습니다
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
