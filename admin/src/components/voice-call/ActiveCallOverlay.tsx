'use client';

import { useState } from 'react';
import { useRequiredVoiceCallContext } from '@/contexts/VoiceCallContext';

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export default function ActiveCallOverlay() {
  const { status, kioskInfo, callDuration, endCall, error } = useRequiredVoiceCallContext();
  const [isMinimized, setIsMinimized] = useState(false);

  // Only show for active call states
  if (status !== 'outgoing' && status !== 'connecting' && status !== 'connected') {
    return null;
  }

  const isConnecting = status === 'outgoing' || status === 'connecting';

  // Minimized view - small floating button
  if (isMinimized) {
    return (
      <button
        onClick={() => setIsMinimized(false)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 bg-green-500 hover:bg-green-600 rounded-full shadow-lg flex items-center justify-center transition-all animate-pulse"
      >
        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
          />
        </svg>
        <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-white text-xs flex items-center justify-center">
          {formatDuration(callDuration).split(':')[0]}
        </span>
      </button>
    );
  }

  // Full overlay
  return (
    <div className="fixed bottom-6 right-6 z-50 animate-slide-up">
      <div className="bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden w-72">
        {/* Header */}
        <div className="bg-gradient-to-r from-green-500 to-green-600 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                />
              </svg>
            </div>
            <div className="text-white">
              <p className="font-medium text-sm">{kioskInfo?.name || '키오스크'}</p>
              {kioskInfo?.location && (
                <p className="text-xs text-white/80">{kioskInfo.location}</p>
              )}
            </div>
          </div>
          <button
            onClick={() => setIsMinimized(true)}
            className="text-white/80 hover:text-white transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>

        {/* Status */}
        <div className="px-4 py-4 text-center border-b">
          {isConnecting ? (
            <div className="flex items-center justify-center gap-2 text-gray-600">
              <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse" />
              <span className="text-sm">연결 중...</span>
            </div>
          ) : (
            <div className="text-2xl font-mono font-semibold text-gray-900">
              {formatDuration(callDuration)}
            </div>
          )}
          {error && (
            <p className="text-xs text-red-500 mt-1">{error}</p>
          )}
        </div>

        {/* Controls */}
        <div className="px-4 py-4 flex items-center justify-center gap-4">
          {/* End call button */}
          <button
            onClick={endCall}
            className="w-14 h-14 bg-red-500 hover:bg-red-600 rounded-full flex items-center justify-center transition-colors shadow-lg"
            title="통화 종료"
          >
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* CSS Animations */}
      <style jsx>{`
        @keyframes slide-up {
          from {
            transform: translateY(100%);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }

        .animate-slide-up {
          animation: slide-up 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}
