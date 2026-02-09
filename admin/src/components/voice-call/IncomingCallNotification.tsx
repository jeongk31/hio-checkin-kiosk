'use client';

import { useState, useEffect } from 'react';
import { useRequiredVoiceCallContext } from '@/contexts/VoiceCallContext';
import { getRingtoneAudio } from './VoiceCallWrapper';

export default function IncomingCallNotification() {
  const { status, kioskInfo, answerCall, declineCall, pendingCalls } = useRequiredVoiceCallContext();
  const [isAnswering, setIsAnswering] = useState(false);

  // Play ringtone when incoming call arrives
  useEffect(() => {
    const audio = getRingtoneAudio();

    if (status === 'incoming' && audio) {
      // Try to play audio
      audio.play().catch(err => {
        console.error('[Ringtone] Audio play failed:', err.message);

        // If audio fails, try to show browser notification as fallback
        if ('Notification' in window && Notification.permission === 'granted') {
          const displayName = kioskInfo?.project_name || kioskInfo?.name || '키오스크';
          new Notification('키오스크 호출', {
            body: `${displayName}에서 호출 중`,
            icon: '/favicon.ico',
            requireInteraction: true,
            tag: 'incoming-call',
          });
        }
      });
    } else if (audio) {
      // Stop ringtone when call ends or is answered
      audio.pause();
      audio.currentTime = 0;
    }
  }, [status, kioskInfo]);

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

  // Display name: use project name (Task 17)
  const displayName = kioskInfo?.project_name || kioskInfo?.name || '키오스크';
  const otherCalls = pendingCalls.filter(c => c.session.id !== kioskInfo?.id && c.kioskInfo.id !== kioskInfo?.id);

  return (
    <div className="fixed top-20 right-6 z-50 animate-slide-in-right flex flex-col gap-3">
      {/* Primary incoming call */}
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
              <p className="font-semibold text-gray-900">{displayName}</p>
              <p className="text-sm text-gray-500">{kioskInfo?.name || ''}</p>
            </div>
            {pendingCalls.length > 1 && (
              <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                +{pendingCalls.length - 1}
              </span>
            )}
          </div>

          <p className="text-center text-gray-600 mb-4 text-sm">
            키오스크에서 호출이 왔습니다
          </p>

          <div className="flex gap-3">
            <button
              onClick={() => declineCall()}
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

      {/* Other pending calls (Task 16) */}
      {otherCalls.length > 0 && otherCalls.map((call) => (
        <div
          key={call.session.id}
          className="bg-white rounded-xl shadow-lg border border-orange-300 p-4 w-80 overflow-hidden relative"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-orange-500 rounded-full flex items-center justify-center animate-pulse">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                />
              </svg>
            </div>
            <div className="flex-1">
              <p className="font-semibold text-gray-900 text-sm">{call.kioskInfo.project_name || call.kioskInfo.name}</p>
              <p className="text-xs text-gray-500">{call.kioskInfo.name} 대기 중</p>
            </div>
          </div>
        </div>
      ))}

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
