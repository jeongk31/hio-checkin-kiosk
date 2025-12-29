'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useVoiceCall, CallStatus } from '@/hooks/useVoiceCall';
import type { Profile, VideoSession } from '@/types/database';

interface KioskInfo {
  id: string;
  name: string;
  location: string | null;
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

  const supabaseRef = useRef(createClient());
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

  // Fetch kiosk info
  const fetchKioskInfo = useCallback(async (kioskId: string): Promise<KioskInfo | null> => {
    const { data } = await supabaseRef.current
      .from('kiosks')
      .select('id, name, location')
      .eq('id', kioskId)
      .single();

    return data;
  }, []);

  // Use a ref to track status without causing re-subscriptions
  const statusRef = useRef(state.status);
  useEffect(() => {
    statusRef.current = state.status;
  }, [state.status]);

  // Subscribe to incoming calls from kiosks using broadcast (more reliable than postgres_changes)
  useEffect(() => {
    const supabase = supabaseRef.current;

    console.log('[Manager] Profile:', { id: profile.id, role: profile.role, project_id: profile.project_id });

    // Only super_admin can receive calls from kiosks
    if (profile.role !== 'super_admin') {
      console.log('[Manager] Not super_admin, skipping voice call subscription');
      return;
    }

    // Super admin subscribes to the dedicated super admin channel
    const channelName = 'voice-calls-super-admin';
    console.log('[Manager] Subscribing to voice call channel:', channelName);

    let isActive = true;

    const channel = supabase
      .channel(channelName)
      .on(
        'broadcast',
        { event: 'incoming-call' },
        async (payload) => {
          if (!isActive) return;
          console.log('[Manager] Broadcast received:', payload);
          const { session } = payload.payload as { session: VideoSession };

          if (!session) {
            console.log('[Manager] No session in payload');
            return;
          }

          // Only handle if not already in a call (use ref to avoid stale closure)
          if (statusRef.current !== 'idle') {
            console.log('[Manager] Ignoring - already in call. Status:', statusRef.current);
            return;
          }

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
      )
      .subscribe((status) => {
        if (!isActive) return;
        console.log('[Manager] Voice call channel status:', status);
        if (status === 'SUBSCRIBED') {
          console.log('[Manager] ✅ Ready to receive incoming calls on:', channelName);
        }
      });

    return () => {
      isActive = false;
      console.log('[Manager] Unsubscribing from voice call channel');
      supabase.removeChannel(channel);
    };
  }, [profile.role, fetchKioskInfo]);

  // Manager calls a kiosk
  const callKiosk = useCallback(async (kioskId: string) => {
    if (state.status !== 'idle') {
      setState((prev) => ({ ...prev, error: '이미 통화 중입니다.' }));
      return;
    }

    const supabase = supabaseRef.current;

    // Get kiosk info first
    const kioskInfo = await fetchKioskInfo(kioskId);
    if (!kioskInfo) {
      setState((prev) => ({ ...prev, error: '키오스크를 찾을 수 없습니다.' }));
      return;
    }

    // Get kiosk's project_id
    const { data: kiosk } = await supabase
      .from('kiosks')
      .select('project_id')
      .eq('id', kioskId)
      .single();

    if (!kiosk) {
      setState((prev) => ({ ...prev, error: '키오스크를 찾을 수 없습니다.' }));
      return;
    }

    // Create video session
    const { data: session, error } = await supabase
      .from('video_sessions')
      .insert({
        kiosk_id: kioskId,
        project_id: kiosk.project_id,
        staff_user_id: profile.id,
        room_name: `voice-${kioskId}-${Date.now()}`,
        status: 'waiting',
        caller_type: 'manager',
      })
      .select()
      .single();

    if (error || !session) {
      console.error('Failed to create session:', error);
      setState((prev) => ({ ...prev, error: '통화를 시작할 수 없습니다.' }));
      return;
    }

    // Broadcast to kiosk that there's an incoming call
    const channelName = `kiosk-incoming-call-${kioskId}`;
    const kioskChannel = supabase.channel(channelName);

    // Subscribe and send broadcast
    await new Promise<void>((resolve) => {
      kioskChannel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          console.log('[Manager] Channel subscribed, sending broadcast to kiosk:', kioskId);
          await kioskChannel.send({
            type: 'broadcast',
            event: 'incoming-call',
            payload: { session },
          });
          console.log('[Manager] Broadcast sent');
          resolve();
        }
      });
    });

    // Clean up channel after a delay
    setTimeout(() => {
      supabase.removeChannel(kioskChannel);
    }, 1000);

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
      await supabase.from('video_sessions').update({ status: 'ended' }).eq('id', session.id);
      resetState();
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
    const supabase = supabaseRef.current;

    // Update session status
    await supabase
      .from('video_sessions')
      .update({
        status: 'connected',
        staff_user_id: profile.id,
      })
      .eq('id', state.currentSession.id);

    // Answer the call - this will send 'call-answered' signal
    console.log('[Manager] Calling voiceCall.answerCall...');
    const success = await voiceCall.answerCall(state.currentSession.id);
    console.log('[Manager] answerCall result:', success);
    if (!success) {
      resetState();
    }
  }, [state.currentSession, profile.id, voiceCall, resetState]);

  // Decline an incoming call
  const declineCall = useCallback(async () => {
    if (!state.currentSession) return;

    const supabase = supabaseRef.current;

    // Update session status
    await supabase
      .from('video_sessions')
      .update({ status: 'ended' })
      .eq('id', state.currentSession.id);

    voiceCall.endCall('declined');
    resetState();
  }, [state.currentSession, voiceCall, resetState]);

  // End the call
  const endCall = useCallback(() => {
    if (!state.currentSession) return;

    const supabase = supabaseRef.current;

    // Update session status
    supabase
      .from('video_sessions')
      .update({
        status: 'ended',
        ended_at: new Date().toISOString(),
      })
      .eq('id', state.currentSession.id)
      .then(() => {});

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
