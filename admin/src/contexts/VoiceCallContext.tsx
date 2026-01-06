'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useVoiceCall, CallStatus } from '@/hooks/useVoiceCall';
import type { Profile, VideoSession } from '@/types/database';

interface KioskInfo {
  id: string;
  name: string;
  location: string | null;
  project_id: string;
}

interface VoiceCallState {
  status: CallStatus;
  currentSession: VideoSession | null;
  kioskInfo: KioskInfo | null;
  callDuration: number;
  error: string | null;
}

interface VoiceCallContextValue extends VoiceCallState {
  callKiosk: (kioskId: string) => Promise<void>;
  answerCall: () => Promise<void>;
  declineCall: () => Promise<void>;
  endCall: () => void;
  remoteAudioRef: React.RefObject<HTMLAudioElement | null>;
}

const VoiceCallContext = createContext<VoiceCallContextValue | null>(null);

interface VoiceCallProviderProps {
  children: React.ReactNode;
  profile: Profile;
}

export function VoiceCallProvider({ children, profile }: VoiceCallProviderProps) {
  const [state, setState] = useState<VoiceCallState>({
    status: 'idle',
    currentSession: null,
    kioskInfo: null,
    callDuration: 0,
    error: null,
  });

  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const callStartTimeRef = useRef<Date | null>(null);

  // Voice call hook
  const voiceCall = useVoiceCall({
    onStatusChange: (status) => {
      setState((prev) => ({ ...prev, status }));

      // Start duration timer when connected
      if (status === 'connected') {
        callStartTimeRef.current = new Date();
        durationIntervalRef.current = setInterval(() => {
          if (callStartTimeRef.current) {
            const duration = Math.floor((Date.now() - callStartTimeRef.current.getTime()) / 1000);
            setState((prev) => ({ ...prev, callDuration: duration }));
          }
        }, 1000);
      }

      // Stop duration timer when call ends
      if (status === 'ended' || status === 'failed' || status === 'idle') {
        if (durationIntervalRef.current) {
          clearInterval(durationIntervalRef.current);
          durationIntervalRef.current = null;
        }
        callStartTimeRef.current = null;
      }
    },
    onError: (error) => {
      setState((prev) => ({ ...prev, error }));
    },
    onCallEnded: (reason) => {
      console.log('Call ended:', reason);
      resetState();
    },
    onRemoteStream: (stream) => {
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = stream;
        remoteAudioRef.current.play().catch(console.error);
      }
    },
  });

  // Reset state
  const resetState = useCallback(() => {
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }
    callStartTimeRef.current = null;
    setState({
      status: 'idle',
      currentSession: null,
      kioskInfo: null,
      callDuration: 0,
      error: null,
    });
  }, []);

  // Fetch kiosk info via API
  const fetchKioskInfo = useCallback(async (kioskId: string): Promise<KioskInfo | null> => {
    try {
      const response = await fetch(`/api/kiosks/${kioskId}`);
      if (response.ok) {
        const data = await response.json();
        return { id: data.id, name: data.name, location: data.location, project_id: data.project_id };
      }
      return null;
    } catch (error) {
      console.error('Error fetching kiosk info:', error);
      return null;
    }
  }, []);

  // Use a ref to track status without causing re-subscriptions
  const statusRef = useRef(state.status);
  useEffect(() => {
    statusRef.current = state.status;
  }, [state.status]);

  // Roles that can receive calls from kiosks
  const VOICE_CALL_ENABLED_ROLES = ['super_admin', 'project_admin', 'manager'];

  // Poll for incoming calls (replaces Supabase Realtime)
  useEffect(() => {
    console.log('[Manager] Profile:', { id: profile.id, role: profile.role, project_id: profile.project_id });

    // Only admin/manager roles can receive calls from kiosks
    if (!VOICE_CALL_ENABLED_ROLES.includes(profile.role)) {
      console.log('[Manager] Role not in voice call enabled list, skipping voice call subscription');
      return;
    }

    console.log('[Manager] Starting incoming call polling...');
    let isActive = true;

    const pollForIncomingCalls = async () => {
      if (!isActive) return;
      
      try {
        // Poll for waiting video sessions
        const response = await fetch('/api/video-sessions?status=waiting&caller_type=kiosk');
        if (response.ok) {
          const data = await response.json();
          const waitingSessions = data.sessions || [];
          
          // Find first waiting session that we haven't already processed
          if (waitingSessions.length > 0 && statusRef.current === 'idle') {
            const session = waitingSessions[0];
            console.log('[Manager] Incoming call from kiosk:', session);
            const kioskInfo = await fetchKioskInfo(session.kiosk_id);

            setState((prev) => ({
              ...prev,
              status: 'incoming',
              currentSession: session,
              kioskInfo,
              error: null,
            }));
          }
        }
      } catch (error) {
        console.error('[Manager] Error polling for incoming calls:', error);
      }
    };

    // Poll every 1.5 seconds for faster call detection
    const interval = setInterval(pollForIncomingCalls, 1500);
    pollForIncomingCalls(); // Initial poll

    return () => {
      isActive = false;
      console.log('[Manager] Stopping incoming call polling');
      clearInterval(interval);
    };
  }, [profile.role, fetchKioskInfo]);

  // Manager calls a kiosk
  const callKiosk = useCallback(async (kioskId: string) => {
    if (state.status !== 'idle') {
      setState((prev) => ({ ...prev, error: '이미 통화 중입니다.' }));
      return;
    }

    // Get kiosk info first
    const kioskInfo = await fetchKioskInfo(kioskId);
    if (!kioskInfo) {
      setState((prev) => ({ ...prev, error: '키오스크를 찾을 수 없습니다.' }));
      return;
    }

    try {
      // Generate a unique room name for this call
      const roomName = `call-${kioskId}-${Date.now()}`;
      
      // Create video session via API with correct parameters
      const response = await fetch('/api/video-sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kiosk_id: kioskId,
          project_id: kioskInfo.project_id,
          room_name: roomName,
          status: 'waiting',
          caller_type: 'manager',
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create video session');
      }

      const { session } = await response.json();

      setState((prev) => ({
        ...prev,
        status: 'outgoing',
        currentSession: session,
        kioskInfo,
        error: null,
      }));

      // Initiate the call
      const success = await voiceCall.initiateCall(session.id);
      if (!success) {
        // Cleanup the session
        await fetch('/api/video-sessions', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: session.id, status: 'ended' }),
        });
        resetState();
      }
    } catch (error) {
      console.error('Failed to create session:', error);
      setState((prev) => ({ ...prev, error: '통화를 시작할 수 없습니다.' }));
    }
  }, [state.status, profile.id, fetchKioskInfo, voiceCall, resetState]);

  // Answer an incoming call
  const answerCall = useCallback(async () => {
    console.log('[Manager] answerCall called, currentSession:', state.currentSession);
    console.log('[Manager] Current state:', state);

    if (!state.currentSession) {
      console.log('[Manager] No current session to answer');
      return;
    }

    console.log('[Manager] Answering call, session:', state.currentSession.id);

    // Update session status via API
    await fetch('/api/video-sessions', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: state.currentSession.id,
        status: 'connected',
        staffUserId: profile.id,
      }),
    });

    // Answer the call - this will send 'call-answered' signal
    console.log('[Manager] Calling voiceCall.answerCall...');
    const success = await voiceCall.answerCall(state.currentSession.id);
    console.log('[Manager] answerCall result:', success);
    if (!success) {
      resetState();
    }
  }, [state.currentSession, state, profile.id, voiceCall, resetState]);

  // Decline an incoming call
  const declineCall = useCallback(async () => {
    if (!state.currentSession) return;

    // Update session status via API
    await fetch('/api/video-sessions', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: state.currentSession.id,
        status: 'ended',
      }),
    });

    voiceCall.endCall('declined');
    resetState();
  }, [state.currentSession, voiceCall, resetState]);

  // End the call
  const endCall = useCallback(() => {
    if (!state.currentSession) return;

    // Update session status via API
    fetch('/api/video-sessions', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: state.currentSession.id,
        status: 'ended',
        endedAt: new Date().toISOString(),
      }),
    });

    voiceCall.endCall('ended');
    resetState();
  }, [state.currentSession, voiceCall, resetState]);

  // Store cleanup function in ref to avoid dependency issues
  const voiceCallCleanupRef = useRef(voiceCall.cleanup);
  useEffect(() => {
    voiceCallCleanupRef.current = voiceCall.cleanup;
  }, [voiceCall.cleanup]);

  // Cleanup on unmount only
  useEffect(() => {
    return () => {
      voiceCallCleanupRef.current();
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
      }
    };
  }, []);

  const value: VoiceCallContextValue = {
    ...state,
    callKiosk,
    answerCall,
    declineCall,
    endCall,
    remoteAudioRef,
  };

  return (
    <VoiceCallContext.Provider value={value}>
      {children}
      {/* Hidden audio element for remote stream */}
      <audio ref={remoteAudioRef} autoPlay playsInline style={{ display: 'none' }} />
    </VoiceCallContext.Provider>
  );
}

export function useVoiceCallContext() {
  const context = useContext(VoiceCallContext);
  // Return null when not in a VoiceCallProvider (e.g., for non-super_admin users)
  return context;
}

export function useRequiredVoiceCallContext() {
  const context = useContext(VoiceCallContext);
  if (!context) {
    throw new Error('useRequiredVoiceCallContext must be used within a VoiceCallProvider');
  }
  return context;
}
