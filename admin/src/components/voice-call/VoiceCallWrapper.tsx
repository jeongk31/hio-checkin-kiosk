'use client';

import { useEffect, useRef, useState } from 'react';
import { VoiceCallProvider } from '@/contexts/VoiceCallContext';
import IncomingCallNotification from './IncomingCallNotification';
import ActiveCallOverlay from './ActiveCallOverlay';
import type { Profile } from '@/types/database';

interface VoiceCallWrapperProps {
  children: React.ReactNode;
  profile: Profile;
}

// Roles that can receive voice calls from kiosks
const VOICE_CALL_ENABLED_ROLES = ['super_admin', 'project_admin', 'manager'];

// LocalStorage key for audio permission
const AUDIO_PERMISSION_KEY = 'voiceCallAudioEnabled';

// Global audio element for ringtone - shared across component instances
let globalRingtoneAudio: HTMLAudioElement | null = null;
let audioUnlocked = false;

export function getRingtoneAudio(): HTMLAudioElement | null {
  return globalRingtoneAudio;
}

export function isAudioUnlocked(): boolean {
  return audioUnlocked;
}

export default function VoiceCallWrapper({ children, profile }: VoiceCallWrapperProps) {
  const [showAudioPrompt, setShowAudioPrompt] = useState(false);

  // Setup global audio and auto-unlock
  useEffect(() => {
    // Create global audio element if not exists
    if (!globalRingtoneAudio) {
      globalRingtoneAudio = new Audio('/audio/ringtone.mp3');
      globalRingtoneAudio.loop = true;
      globalRingtoneAudio.load();
    }

    // Check if user previously granted permission (CLIENT SIDE ONLY)
    const savedPermission = typeof window !== 'undefined' ? localStorage.getItem(AUDIO_PERMISSION_KEY) : null;
    
    // If user never granted, show the popup
    if (!savedPermission) {
      setShowAudioPrompt(true);
      return;
    }
    
    // If user denied before, don't try to unlock
    if (savedPermission === 'denied') {
      return;
    }
    
    // User previously granted - auto-unlock on ANY interaction
    // This makes it work like Facebook - once allowed, always works!
    console.log('[VoiceCallWrapper] 🔔 User previously allowed. Will auto-unlock on first click anywhere...');
    console.log('[VoiceCallWrapper] Current audioUnlocked status:', audioUnlocked);
    
    // Reset audioUnlocked for this page load (browser security requires re-unlock each load)
    audioUnlocked = false;
    
    const unlockOnInteraction = () => {
      if (audioUnlocked || !globalRingtoneAudio) return;
      
      console.log('[VoiceCallWrapper] 🎵 Auto-unlocking audio...');
      
      globalRingtoneAudio.volume = 0.01; // Silent unlock
      globalRingtoneAudio.play()
        .then(() => {
          globalRingtoneAudio!.pause();
          globalRingtoneAudio!.currentTime = 0;
          globalRingtoneAudio!.volume = 1;
          audioUnlocked = true;
          console.log('[VoiceCallWrapper] ✅ Audio ready! Ringtone will work in ALL tabs.');
        })
        .catch(err => {
          console.log('[VoiceCallWrapper] Auto-unlock failed, will retry:', err.message);
        });
    };
    
    // Listen for ANY user interaction to unlock
    document.addEventListener('click', unlockOnInteraction, { once: true });
    document.addEventListener('keydown', unlockOnInteraction, { once: true });
    document.addEventListener('touchstart', unlockOnInteraction, { once: true });
    
    return () => {
      document.removeEventListener('click', unlockOnInteraction);
      document.removeEventListener('keydown', unlockOnInteraction);
      document.removeEventListener('touchstart', unlockOnInteraction);
    };
  }, []);

  const handleEnableAudio = async () => {
    console.log('[VoiceCallWrapper] 🔔 User clicked ALLOW - enabling notifications...');
    
    // 1. Request browser notification permission (PERSISTS ACROSS ALL TABS!)
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      try {
        const permission = await Notification.requestPermission();
        console.log('[VoiceCallWrapper] 📢 Browser notification permission:', permission);
        if (permission === 'granted') {
          new Notification('알림이 활성화되었습니다', {
            body: '키오스크 호출을 모든 탭에서 받을 수 있습니다.',
            icon: '/favicon.ico',
          });
        }
      } catch (err) {
        console.log('[VoiceCallWrapper] Notification permission error:', err);
      }
    }
    
    // 2. Unlock audio for ringtone
    if (!globalRingtoneAudio) return;
    
    globalRingtoneAudio.volume = 0.3;
    globalRingtoneAudio.loop = false;
    
    const playPromise = globalRingtoneAudio.play();
    
    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          console.log('[VoiceCallWrapper] ✅ Audio unlocked successfully!');
          
          setTimeout(() => {
            if (globalRingtoneAudio) {
              globalRingtoneAudio.pause();
              globalRingtoneAudio.currentTime = 0;
              globalRingtoneAudio.loop = true;
              globalRingtoneAudio.volume = 1;
              audioUnlocked = true;
            }
          }, 500);
          
          setShowAudioPrompt(false);
          if (typeof window !== 'undefined') {
            localStorage.setItem(AUDIO_PERMISSION_KEY, 'granted');
          }
          console.log('[VoiceCallWrapper] 🎉 All set! Ringtone will work in ALL tabs after any click.');
        })
        .catch(err => {
          console.error('[VoiceCallWrapper] Enable audio failed:', err);
          alert('오디오 활성화에 실패했습니다. 브라우저 설정을 확인해주세요.');
        });
    }
  };

  const handleDenyAudio = () => {
    console.log('[VoiceCallWrapper] Audio denied by user');
    setShowAudioPrompt(false);
    if (typeof window !== 'undefined') {
      localStorage.setItem(AUDIO_PERMISSION_KEY, 'denied');
    }
  };

  // Only admin/manager roles can receive calls from kiosks
  // Kiosk users don't need voice call context (they use KioskApp directly)
  if (!VOICE_CALL_ENABLED_ROLES.includes(profile.role)) {
    return <>{children}</>;
  }

  return (
    <VoiceCallProvider profile={profile}>
      {children}
      
      {/* Audio permission popup modal */}
      {showAudioPrompt && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '12px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            padding: '24px',
            maxWidth: '400px',
            width: '90%',
            textAlign: 'center'
          }}>
            {/* Icon */}
            <div style={{
              width: '64px',
              height: '64px',
              backgroundColor: '#dbeafe',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px'
            }}>
              <svg style={{ width: '32px', height: '32px', color: '#2563eb' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M9 15l-5-5h2a7 7 0 017-7v2a5 5 0 00-5 5H6l5 5z" />
              </svg>
            </div>
            
            {/* Title */}
            <h3 style={{
              fontSize: '18px',
              fontWeight: 600,
              color: '#111827',
              marginBottom: '8px'
            }}>
              호출 알림 활성화
            </h3>
            
            {/* Description */}
            <p style={{
              fontSize: '14px',
              color: '#6b7280',
              marginBottom: '24px',
              lineHeight: '1.5'
            }}>
              키오스크에서 호출이 오면 알림음을 재생합니다.<br />
              알림을 받으시려면 허용을 눌러주세요.
            </p>
            
            {/* Buttons */}
            <div style={{
              display: 'flex',
              gap: '12px',
              justifyContent: 'center'
            }}>
              <button
                onClick={handleDenyAudio}
                style={{
                  padding: '10px 24px',
                  fontSize: '14px',
                  fontWeight: 500,
                  color: '#374151',
                  backgroundColor: '#f3f4f6',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer'
                }}
              >
                나중에
              </button>
              <button
                onClick={handleEnableAudio}
                style={{
                  padding: '10px 24px',
                  fontSize: '14px',
                  fontWeight: 500,
                  color: 'white',
                  backgroundColor: '#2563eb',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer'
                }}
              >
                허용
              </button>
            </div>
          </div>
        </div>
      )}
      
      <IncomingCallNotification />
      <ActiveCallOverlay />
    </VoiceCallProvider>
  );
}
