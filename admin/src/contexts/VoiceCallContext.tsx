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
      console.log('[Manager Dashboard Context] 📢 onStatusChange called with status:', status);
      console.log('[Manager Dashboard Context] Current state.status:', state.status);
      setState((prev) => {
        console.log('[Manager Dashboard Context] Updating status from', prev.status, 'to', status);
        return { ...prev, status };
      });

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

      // Auto-reset to idle when call ends or fails
      if (status === 'ended' || status === 'failed') {
        console.log('[Manager Dashboard Context] Call ended/failed, resetting to idle immediately');
        if (durationIntervalRef.current) {
          clearInterval(durationIntervalRef.current);
          durationIntervalRef.current = null;
        }
        callStartTimeRef.current = null;
        
        // Reset to idle immediately for instant response
        resetState();
      }
      
      // Clear timer when idle
      if (status === 'idle') {
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
      console.log('[Manager Dashboard Context] onCallEnded callback invoked with reason:', reason);
      console.log('[Manager Dashboard Context] resetState function exists:', typeof resetState);
      resetState();
      console.log('[Manager Dashboard Context] resetState called');
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
    console.log('[Manager Dashboard] resetState called - resetting to idle');
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }
    callStartTimeRef.current = null;
    
    // Update ref FIRST before setState to prevent race conditions
    statusRef.current = 'idle';
    
    setState({
      status: 'idle',
      currentSession: null,
      kioskInfo: null,
      callDuration: 0,
      error: null,
    });
    
    console.log('[Manager Dashboard] State reset to idle, statusRef.current:', statusRef.current);
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
  const currentSessionRef = useRef(state.currentSession);
  useEffect(() => {
    statusRef.current = state.status;
    currentSessionRef.current = state.currentSession;
  }, [state.status, state.currentSession]);

  // Roles that can receive calls from kiosks
  const VOICE_CALL_ENABLED_ROLES = ['super_admin', 'project_admin', 'manager'];

  // Poll for incoming calls (replaces Supabase Realtime)
  useEffect(() => {
    console.log('[Manager Dashboard] Profile:', { id: profile.id, role: profile.role, project_id: profile.project_id });

    // Only admin/manager roles can receive calls from kiosks
    if (!VOICE_CALL_ENABLED_ROLES.includes(profile.role)) {
      console.log('[Manager Dashboard] Role not in voice call enabled list, skipping voice call subscription');
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
          
          console.log('[Manager Poll] Current status:', statusRef.current, 'Waiting sessions:', waitingSessions.length);
          
          // If we have an incoming call but it's no longer in the waiting list, it was cancelled
          if (statusRef.current === 'incoming' && currentSessionRef.current) {
            const stillWaiting = waitingSessions.some((s: any) => s.id === currentSessionRef.current?.id);
            if (!stillWaiting) {
              console.log('[Manager Poll] Current incoming call was cancelled, clearing');
              setState((prev) => ({
                ...prev,
                status: 'idle',
                currentSession: null,
                kioskInfo: null,
                error: null,
              }));
              return;
            }
          }
          
          // If status is incoming but no waiting sessions at all, also clear
          if (statusRef.current === 'incoming' && waitingSessions.length === 0) {
            console.log('[Manager Poll] No waiting sessions but status is incoming, clearing');
            setState((prev) => ({
              ...prev,
              status: 'idle',
              currentSession: null,
              kioskInfo: null,
              error: null,
            }));
            return;
          }
          
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
          } else if (waitingSessions.length > 0) {
            console.log('[Manager Dashboard Poll] Waiting sessions exist but status is not idle:', statusRef.current);
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

    // Decline other waiting sessions from the same project to notify other kiosks
    try {
      const projectId = state.currentSession.project_id || profile.project_id;
      if (projectId) {
        await fetch('/api/video-sessions/decline-others', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            answeredSessionId: state.currentSession.id,
            projectId,
          }),
        });
        console.log('[Manager] Declined other waiting sessions');
      }
    } catch (error) {
      console.error('[Manager] Failed to decline other sessions:', error);
      // Continue anyway - this is not critical
    }

    // Answer the call - this will send 'call-answered' signal
    console.log('[Manager] Calling voiceCall.answerCall...');
    const success = await voiceCall.answerCall(state.currentSession.id);
    console.log('[Manager] answerCall result:', success);
    if (!success) {
      resetState();
    }
  }, [state.currentSession, state, profile.id, profile.project_id, voiceCall, resetState]);

  // Decline an incoming call
  const declineCall = useCallback(async () => {
    if (!state.currentSession) return;

    // Send decline signal via signaling API (since we haven't set up WebRTC channel yet)
    try {
      await fetch('/api/signaling', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: state.currentSession.id,
          payload: { type: 'call-ended', reason: 'declined' },
        }),
      });
      console.log('[Manager] Sent decline signal to kiosk');
    } catch (error) {
      console.error('[Manager] Failed to send decline signal:', error);
    }

    // Update session status via API - ensure ended_at is set
    await fetch('/api/video-sessions', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: state.currentSession.id,
        status: 'ended',
        ended_at: new Date().toISOString(),
      }),
    });

    voiceCall.endCall('declined');
    resetState();
  }, [state.currentSession, voiceCall, resetState]);

  // End the call
  const endCall = useCallback(async () => {
    if (!state.currentSession) return;

    console.log('[Manager] Ending call, updating session:', state.currentSession.id);
    // Update session status via API - ensure ended_at is set
    try {
      await fetch('/api/video-sessions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: state.currentSession.id,
          status: 'ended',
          ended_at: new Date().toISOString(),
        }),
      });
      console.log('[Manager] Session updated to ended');
    } catch (error) {
      console.error('[Manager] Failed to update session:', error);
    }

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
