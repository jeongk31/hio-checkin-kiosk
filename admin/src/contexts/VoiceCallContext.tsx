'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useVoiceCall, type CallStatus } from '@/lib/voicecall';
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
  const isEndingCallRef = useRef<boolean>(false);

  // Voice call hook (admin side)
  const voiceCall = useVoiceCall({
    callerType: 'admin',
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
      console.log('[Manager Dashboard Context] isEndingCallRef.current:', isEndingCallRef.current);
      
      // If we're already ending the call from our side, don't reset again
      if (isEndingCallRef.current) {
        console.log('[Manager Dashboard Context] Already ending call, skipping resetState');
        return;
      }
      
      console.log('[Manager Dashboard Context] Kiosk ended call, calling resetState');
      resetState();
    },
    onRemoteStream: (stream) => {
      console.log(`[Manager Dashboard Context] 🎧 Remote stream received, tracks: ${stream.getTracks().length}`);
      stream.getTracks().forEach(track => {
        console.log(`[Manager Dashboard Context]    Track: kind=${track.kind}, enabled=${track.enabled}, muted=${track.muted}`);
      });
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = stream;
        remoteAudioRef.current.play().catch(err => {
          console.error('[Manager Dashboard Context] ❌ Audio play error:', err);
        });
        console.log('[Manager Dashboard Context] ✅ Audio element attached');
      }
    },
    onDurationChange: (duration) => {
      if (duration % 10 === 0) {
        console.log(`[Manager Dashboard Context] ⏱️ Hook duration: ${duration}s`);
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
    
    // Reset the ending flag
    isEndingCallRef.current = false;
    
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
      
      // Don't poll for new calls if we're already in a call or transitioning
      if (statusRef.current !== 'idle' && statusRef.current !== 'incoming') {
        // Skip polling during active calls, connecting, or ending states
        return;
      }
      
      try {
        // Poll for waiting video sessions
        const response = await fetch('/api/video-sessions?status=waiting&caller_type=kiosk');
        if (response.ok) {
          const data = await response.json();
          const waitingSessions = data.sessions || [];
          
          console.log('[Manager Poll] Current status:', statusRef.current, 'Waiting sessions:', waitingSessions.length);
          
          // If we have an incoming call but it's no longer in the waiting list, check if it was cancelled or answered
          if (statusRef.current === 'incoming' && currentSessionRef.current) {
            const stillWaiting = waitingSessions.some((s: VideoSession) => s.id === currentSessionRef.current?.id);
            if (!stillWaiting) {
              // Check if the session still exists in database (could be connected/ended)
              try {
                const sessionCheck = await fetch(`/api/video-sessions/${currentSessionRef.current.id}`);
                if (sessionCheck.ok) {
                  const sessionData = await sessionCheck.json();
                  if (sessionData.session && sessionData.session.status === 'ended') {
                    // Session was cancelled/ended, clear state
                    console.log('[Manager Poll] Current incoming call was cancelled/ended, clearing');
                    resetState();
                    return;
                  }
                  // Session exists and is connected/connecting, don't clear
                  console.log('[Manager Poll] Session no longer waiting but still active:', sessionData.session.status);
                  return;
                } else {
                  // Session deleted, clear state
                  console.log('[Manager Poll] Session not found, clearing');
                  resetState();
                  return;
                }
              } catch (err) {
                console.error('[Manager Poll] Error checking session:', err);
                // Don't clear on error, keep current state
                return;
              }
            }
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
    console.log('[Manager] 📞 answerCall called');
    console.log('[Manager]    currentSession:', state.currentSession?.id);
    console.log('[Manager]    kioskInfo:', state.kioskInfo?.name);
    console.log('[Manager]    status:', state.status);

    if (!state.currentSession) {
      console.log('[Manager] ⚠️ No current session to answer');
      return;
    }

    console.log(`[Manager] 📞 Answering call, session: ${state.currentSession.id}, kiosk: ${state.kioskInfo?.name}`);

    // IMPORTANT: Update status to 'connecting' immediately to prevent poll race condition
    // The poll skips when status is not 'idle' or 'incoming', so this prevents it from
    // checking the session while we're in the middle of answering
    statusRef.current = 'connecting';
    setState((prev) => ({ ...prev, status: 'connecting' }));

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
    console.log('[Manager] ❌ declineCall called');
    if (!state.currentSession) {
      console.log('[Manager] ⚠️ No current session to decline');
      return;
    }

    console.log(`[Manager] ❌ Declining call, session: ${state.currentSession.id}, kiosk: ${state.kioskInfo?.name}`);

    // Send decline signal via signaling API (since we haven't set up WebRTC channel yet)
    try {
      console.log('[Manager]    Sending decline signal to kiosk...');
      await fetch('/api/signaling', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: state.currentSession.id,
          payload: { type: 'call-ended', reason: 'declined' },
          sender: 'admin',
        }),
      });
      console.log('[Manager] ✅ Decline signal sent to kiosk');
    } catch (error) {
      console.error('[Manager] ❌ Failed to send decline signal:', error);
    }

    // Update session status via API - ensure ended_at is set
    console.log('[Manager]    Updating session status to ended in DB...');
    await fetch('/api/video-sessions', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: state.currentSession.id,
        status: 'ended',
        ended_at: new Date().toISOString(),
      }),
    });
    console.log('[Manager] ✅ Session status updated to ended');

    console.log('[Manager]    Calling voiceCall.endCall(declined)...');
    voiceCall.endCall('declined');
    console.log('[Manager]    Calling resetState...');
    resetState();
    console.log('[Manager] ✅ Call declined successfully');
  }, [state.currentSession, state.kioskInfo, voiceCall, resetState]);

  // End the call
  const endCall = useCallback(async () => {
    // Log the call stack to see who's calling this
    console.log('[Manager] endCall called from:');
    console.trace();
    
    // Set flag to prevent double-reset from onCallEnded callback
    isEndingCallRef.current = true;
    
    // ALWAYS send the call-ended signal first, even if we don't have a session reference
    // This ensures the kiosk knows the call was ended intentionally
    console.log('[Manager] Sending call-ended signal to peer...');
    voiceCall.endCall('ended');
    
    // Use ref to get the current session (more reliable than state)
    const session = currentSessionRef.current || state.currentSession;
    
    if (!session) {
      console.log('[Manager] No current session to update in database');
      console.log('[Manager] state.currentSession:', state.currentSession);
      console.log('[Manager] currentSessionRef.current:', currentSessionRef.current);
      console.log('[Manager] Signal sent, now cleaning up...');
      voiceCall.cleanup();
      resetState();
      return;
    }

    console.log('[Manager] Ending call, session:', session.id);
    
    // Update database session status
    try {
      const response = await fetch('/api/video-sessions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: session.id,
          status: 'ended',
          ended_at: new Date().toISOString(),
        }),
      });
      
      if (!response.ok) {
        console.error('[Manager] Failed to update session, status:', response.status);
      } else {
        console.log('[Manager] Session updated to ended in database');
      }
    } catch (error) {
      console.error('[Manager] Failed to update session:', error);
    }

    // Finally reset local state
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
