'use client';

import { useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';

// STUN servers for NAT traversal
const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
];

export type SignalingMessage =
  | { type: 'offer'; sdp: string }
  | { type: 'answer'; sdp: string }
  | { type: 'ice-candidate'; candidate: RTCIceCandidateInit }
  | { type: 'call-answered' }
  | { type: 'call-ended'; reason: 'declined' | 'ended' | 'timeout' | 'error' };

export type CallStatus = 'idle' | 'outgoing' | 'incoming' | 'connecting' | 'connected' | 'ended' | 'failed';

interface UseVoiceCallOptions {
  onStatusChange?: (status: CallStatus) => void;
  onError?: (error: string) => void;
  onCallEnded?: (reason: string) => void;
  onRemoteStream?: (stream: MediaStream) => void;
}

export function useVoiceCall(options: UseVoiceCallOptions = {}) {
  const { onStatusChange, onError, onCallEnded, onRemoteStream } = options;

  const supabaseRef = useRef(createClient());
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);

  // Request microphone access
  const requestMicrophone = useCallback(async (): Promise<MediaStream | null> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false
      });
      localStreamRef.current = stream;
      return stream;
    } catch (error) {
      if (error instanceof DOMException) {
        if (error.name === 'NotAllowedError') {
          onError?.('마이크 권한이 필요합니다. 브라우저 설정에서 마이크 권한을 허용해주세요.');
        } else if (error.name === 'NotFoundError') {
          onError?.('마이크를 찾을 수 없습니다. 마이크가 연결되어 있는지 확인해주세요.');
        } else {
          onError?.(`마이크 오류: ${error.message}`);
        }
      }
      return null;
    }
  }, [onError]);

  // Create RTCPeerConnection
  const createPeerConnection = useCallback((): RTCPeerConnection => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    pc.onicecandidate = (event) => {
      if (event.candidate && channelRef.current) {
        console.log('[Manager] Sending ICE candidate');
        channelRef.current.send({
          type: 'broadcast',
          event: 'signaling',
          payload: { type: 'ice-candidate', candidate: event.candidate.toJSON() } as SignalingMessage,
        });
      } else if (!event.candidate) {
        console.log('[Manager] ICE gathering complete');
      }
    };

    pc.ontrack = (event) => {
      console.log('[Manager] Received remote track');
      const [remoteStream] = event.streams;
      remoteStreamRef.current = remoteStream;
      onRemoteStream?.(remoteStream);
    };

    pc.onconnectionstatechange = () => {
      console.log('[Manager] Connection state:', pc.connectionState);
      switch (pc.connectionState) {
        case 'connected':
          console.log('[Manager] Call connected!');
          onStatusChange?.('connected');
          break;
        case 'disconnected':
        case 'failed':
          console.log('[Manager] Connection failed or disconnected');
          onError?.('연결이 끊어졌습니다.');
          onStatusChange?.('failed');
          break;
        case 'closed':
          onStatusChange?.('ended');
          break;
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log('[Manager] ICE connection state:', pc.iceConnectionState);
      if (pc.iceConnectionState === 'failed') {
        onError?.('네트워크 연결에 실패했습니다. 다시 시도해주세요.');
        onStatusChange?.('failed');
      }
    };

    pc.onicegatheringstatechange = () => {
      console.log('[Manager] ICE gathering state:', pc.iceGatheringState);
    };

    peerConnectionRef.current = pc;
    return pc;
  }, [onStatusChange, onError, onRemoteStream]);

  // Handle signaling messages
  const handleSignalingMessage = useCallback(async (payload: SignalingMessage) => {
    console.log('[Manager] 📥 handleSignalingMessage:', payload.type);
    const pc = peerConnectionRef.current;
    if (!pc) {
      console.log('[Manager] No peer connection for signaling');
      return;
    }

    switch (payload.type) {
      case 'offer':
        try {
          console.log('[Manager] Received offer, setting remote description');
          await pc.setRemoteDescription({ type: 'offer', sdp: payload.sdp });
          console.log('[Manager] Remote description set, pending candidates:', pendingCandidatesRef.current.length);
          // Add any pending ICE candidates
          for (const candidate of pendingCandidatesRef.current) {
            console.log('[Manager] Adding pending ICE candidate');
            await pc.addIceCandidate(candidate);
          }
          pendingCandidatesRef.current = [];
          // Create and send answer
          console.log('[Manager] Creating answer');
          const answer = await pc.createAnswer();
          console.log('[Manager] Setting local description');
          await pc.setLocalDescription(answer);
          console.log('[Manager] Local description set, ICE gathering state:', pc.iceGatheringState);
          console.log('[Manager] Sending answer, channel available:', !!channelRef.current);
          channelRef.current?.send({
            type: 'broadcast',
            event: 'signaling',
            payload: { type: 'answer', sdp: answer.sdp } as SignalingMessage,
          });
          onStatusChange?.('connecting');
        } catch (err) {
          console.error('[Manager] Error processing offer:', err);
        }
        break;

      case 'answer':
        console.log('[Manager] Received answer, setting remote description');
        await pc.setRemoteDescription({ type: 'answer', sdp: payload.sdp });
        // Add any pending ICE candidates
        for (const candidate of pendingCandidatesRef.current) {
          await pc.addIceCandidate(candidate);
        }
        pendingCandidatesRef.current = [];
        onStatusChange?.('connecting');
        break;

      case 'ice-candidate':
        console.log('[Manager] Received ICE candidate');
        if (pc.remoteDescription) {
          await pc.addIceCandidate(payload.candidate);
        } else {
          // Queue the candidate until we have the remote description
          console.log('[Manager] Queuing ICE candidate (no remote description yet)');
          pendingCandidatesRef.current.push(payload.candidate);
        }
        break;

      case 'call-answered':
        console.log('[Manager] Kiosk acknowledged call-answered, re-sending offer...');
        console.log('[Manager] Current connection state:', pc.connectionState);
        console.log('[Manager] Current signaling state:', pc.signalingState);
        console.log('[Manager] Has local description:', !!pc.localDescription);
        console.log('[Manager] Channel ref available:', !!channelRef.current);
        // Re-send the offer now that kiosk is subscribed to the channel
        if (pc.localDescription?.sdp) {
          console.log('[Manager] 📤 RE-SENDING SDP offer to kiosk, offer length:', pc.localDescription.sdp.length);
          const sendResult = channelRef.current?.send({
            type: 'broadcast',
            event: 'signaling',
            payload: { type: 'offer', sdp: pc.localDescription.sdp } as SignalingMessage,
          });
          console.log('[Manager] Offer re-send result:', sendResult);
        } else {
          console.log('[Manager] ⚠️ WARNING: No local description to re-send!');
        }
        onStatusChange?.('connecting');
        break;

      case 'call-ended':
        onCallEnded?.(payload.reason);
        cleanup();
        break;
    }
  }, [onStatusChange, onCallEnded]);

  // Setup signaling channel
  const setupSignalingChannel = useCallback((sessionId: string): RealtimeChannel => {
    const supabase = supabaseRef.current;
    const channelName = `voice-call-${sessionId}`;
    const channel = supabase.channel(channelName);

    channel.on('broadcast', { event: 'signaling' }, ({ payload }) => {
      handleSignalingMessage(payload as SignalingMessage);
    });

    channelRef.current = channel;
    sessionIdRef.current = sessionId;
    return channel;
  }, [handleSignalingMessage]);

  // Initiate a call (create offer)
  const initiateCall = useCallback(async (sessionId: string): Promise<boolean> => {
    try {
      // Get microphone access
      const stream = await requestMicrophone();
      if (!stream) return false;

      // Create peer connection
      const pc = createPeerConnection();

      // Add local tracks
      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream);
      });

      // Setup signaling channel
      const channel = setupSignalingChannel(sessionId);

      // Subscribe and send offer
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Channel subscription timeout')), 10000);

        channel.subscribe(async (status) => {
          console.log('[Manager] Signaling channel status:', status);
          if (status === 'SUBSCRIBED') {
            clearTimeout(timeout);
            try {
              // Create and send offer
              console.log('[Manager] Creating initial SDP offer...');
              const offer = await pc.createOffer();
              await pc.setLocalDescription(offer);

              console.log('[Manager] 📤 Sending initial SDP offer to kiosk, length:', offer.sdp?.length);
              channel.send({
                type: 'broadcast',
                event: 'signaling',
                payload: { type: 'offer', sdp: offer.sdp } as SignalingMessage,
              });

              resolve();
            } catch (err) {
              reject(err);
            }
          } else if (status === 'CHANNEL_ERROR') {
            clearTimeout(timeout);
            reject(new Error('Channel error'));
          }
        });
      });

      return true;
    } catch (error) {
      console.error('Failed to initiate call:', error);
      onError?.('통화를 시작할 수 없습니다. 다시 시도해주세요.');
      cleanup();
      return false;
    }
  }, [requestMicrophone, createPeerConnection, setupSignalingChannel, onError]);

  // Answer an incoming call (kiosk → manager flow)
  const answerCall = useCallback(async (sessionId: string): Promise<boolean> => {
    try {
      console.log('[Manager] answerCall starting, sessionId:', sessionId);

      // Get microphone access
      const stream = await requestMicrophone();
      if (!stream) {
        console.log('[Manager] Failed to get microphone');
        return false;
      }
      console.log('[Manager] Got microphone access');

      // Create peer connection
      const pc = createPeerConnection();
      console.log('[Manager] Created peer connection');

      // Add local tracks
      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream);
      });

      // Setup signaling channel with INLINE handler (avoids stale closure issues)
      const supabase = supabaseRef.current;
      const channelName = `voice-call-${sessionId}`;
      console.log('[Manager] Setting up signaling channel:', channelName);

      const channel = supabase.channel(channelName);
      channelRef.current = channel;
      sessionIdRef.current = sessionId;

      // Inline signaling handler with direct access to pc and channel
      channel.on('broadcast', { event: 'signaling' }, async ({ payload }) => {
        const msg = payload as SignalingMessage;
        console.log('[Manager] 📥 Received signaling message:', msg.type);

        if (msg.type === 'offer' && 'sdp' in msg) {
          try {
            console.log('[Manager] Processing offer from kiosk...');
            console.log('[Manager] PC signaling state before setRemoteDescription:', pc.signalingState);

            await pc.setRemoteDescription({ type: 'offer', sdp: msg.sdp });
            console.log('[Manager] Remote description set');

            // Add any pending ICE candidates
            for (const candidate of pendingCandidatesRef.current) {
              console.log('[Manager] Adding pending ICE candidate');
              await pc.addIceCandidate(candidate);
            }
            pendingCandidatesRef.current = [];

            // Create and send answer
            console.log('[Manager] Creating answer...');
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            console.log('[Manager] Local description set, sending answer...');

            channel.send({
              type: 'broadcast',
              event: 'signaling',
              payload: { type: 'answer', sdp: answer.sdp } as SignalingMessage,
            });
            console.log('[Manager] 📤 Answer sent to kiosk');
            onStatusChange?.('connecting');
          } catch (err) {
            console.error('[Manager] Error processing offer:', err);
            onError?.('통화 연결에 실패했습니다.');
          }
        } else if (msg.type === 'ice-candidate' && 'candidate' in msg) {
          console.log('[Manager] Received ICE candidate');
          if (pc.remoteDescription) {
            await pc.addIceCandidate(msg.candidate);
          } else {
            console.log('[Manager] Queuing ICE candidate (no remote description yet)');
            pendingCandidatesRef.current.push(msg.candidate);
          }
        } else if (msg.type === 'call-ended') {
          console.log('[Manager] Kiosk ended call');
          onCallEnded?.(msg.reason);
          cleanup();
        }
      });

      // Subscribe and send call-answered signal
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Channel subscription timeout')), 10000);

        channel.subscribe((status) => {
          console.log('[Manager] Answer channel status:', status);
          if (status === 'SUBSCRIBED') {
            clearTimeout(timeout);
            // Send call-answered signal - kiosk will then send offer
            console.log('[Manager] 📤 Sending call-answered signal to kiosk');
            channel.send({
              type: 'broadcast',
              event: 'signaling',
              payload: { type: 'call-answered' } as SignalingMessage,
            });
            resolve();
          } else if (status === 'CHANNEL_ERROR') {
            clearTimeout(timeout);
            reject(new Error('Channel error'));
          }
        });
      });

      console.log('[Manager] answerCall setup complete, waiting for offer from kiosk...');
      return true;
    } catch (error) {
      console.error('[Manager] Failed to answer call:', error);
      onError?.('통화에 응답할 수 없습니다. 다시 시도해주세요.');
      cleanup();
      return false;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestMicrophone, createPeerConnection, onStatusChange, onError, onCallEnded]);

  // End the call
  const endCall = useCallback((reason: 'declined' | 'ended' | 'timeout' | 'error' = 'ended') => {
    // Send end signal
    channelRef.current?.send({
      type: 'broadcast',
      event: 'signaling',
      payload: { type: 'call-ended', reason } as SignalingMessage,
    });

    cleanup();
    onStatusChange?.('ended');
  }, [onStatusChange]);

  // Cleanup all resources
  const cleanup = useCallback(() => {
    // Stop local tracks
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;

    // Close peer connection
    peerConnectionRef.current?.close();
    peerConnectionRef.current = null;

    // Remove channel
    if (channelRef.current) {
      supabaseRef.current.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    // Clear pending candidates
    pendingCandidatesRef.current = [];

    // Clear remote stream
    remoteStreamRef.current = null;
    sessionIdRef.current = null;
  }, []);

  return {
    initiateCall,
    answerCall,
    endCall,
    cleanup,
    getLocalStream: () => localStreamRef.current,
    getRemoteStream: () => remoteStreamRef.current,
    getSessionId: () => sessionIdRef.current,
  };
}
