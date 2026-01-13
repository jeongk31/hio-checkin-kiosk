'use client';

import { useState, useEffect } from 'react';
import { useRequiredVoiceCallContext } from '@/contexts/VoiceCallContext';

export default function IncomingCallNotification() {
  const { status, kioskInfo, answerCall, declineCall } = useRequiredVoiceCallContext();
  const [isAnswering, setIsAnswering] = useState(false);

  // Reset isAnswering when status changes from incoming
  useEffect(() => {
    if (status !== 'incoming') {
      setIsAnswering(false);
    }
  }, [status]);

  // Show popup only for incoming calls
  if (status !== 'incoming') return null;

  const handleAnswer = async () => {
    console.log('[IncomingCallNotification] handleAnswer clicked, isAnswering:', isAnswering);
    if (isAnswering) return;
    setIsAnswering(true);
    console.log('[IncomingCallNotification] Calling answerCall...');
    try {
      await answerCall();
      console.log('[IncomingCallNotification] answerCall completed');
    } catch (error) {
      console.error('[IncomingCallNotification] answerCall error:', error);
    }
  };

  return (
    <div className="fixed top-20 right-6 z-50 animate-slide-in-right">
      <div className="bg-white rounded-xl shadow-2xl border-2 border-blue-500 p-5 w-80 overflow-hidden relative">
        <div className="absolute inset-0 bg-blue-50 animate-pulse-slow opacity-50 pointer-events-none" />

        <div className="relative">
          <div className="flex items-center gap-3 mb-4">
            <div className="relative">
              <div className="w-12 h-12 bg-green-500 rounded-full flex items-center justify-center animate-pulse">
                <svg
                  className="w-6 h-6 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                  />
                </svg>
              </div>
              <div className="absolute inset-0 rounded-full bg-green-500 animate-ping opacity-25 pointer-events-none" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-gray-900">{kioskInfo?.name || '키오스크'}</p>
              {kioskInfo?.location && (
                <p className="text-sm text-gray-500">{kioskInfo.location}</p>
              )}
            </div>
          </div>

          <p className="text-center text-gray-600 mb-4 text-sm">
            키오스크에서 호출이 왔습니다
          </p>

          <div className="flex gap-3">
            <button
              onClick={declineCall}
              className="flex-1 py-2.5 px-4 bg-red-500 hover:bg-red-600 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              거절
            </button>
            <button
              onClick={handleAnswer}
              disabled={isAnswering}
              className="flex-1 py-2.5 px-4 bg-green-500 hover:bg-green-600 disabled:bg-green-400 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                />
              </svg>
              응답
            </button>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes slide-in-right {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }

        @keyframes pulse-slow {
          0%, 100% {
            opacity: 0.3;
          }
          50% {
            opacity: 0.5;
          }
        }

        .animate-slide-in-right {
          animation: slide-in-right 0.3s ease-out;
        }

        .animate-pulse-slow {
          animation: pulse-slow 2s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
