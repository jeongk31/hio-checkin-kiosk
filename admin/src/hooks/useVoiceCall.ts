'use client';

import { useRef, useCallback, useEffect } from 'react';

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

// Simple signaling using polling API (fallback for when WebSocket is not available)
class SignalingChannel {
  private sessionId: string;
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private messageHandler: ((msg: SignalingMessage) => void) | null = null;
  private lastMessageId: number = 0;

  constructor(sessionId: string) {
    this.sessionId = sessionId;
  }

  onMessage(handler: (msg: SignalingMessage) => void) {
    this.messageHandler = handler;
  }

  async subscribe(): Promise<void> {
    // Start polling for messages
    this.pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`/api/signaling?sessionId=${this.sessionId}&lastId=${this.lastMessageId}`);
        if (response.ok) {
          const data = await response.json();
          if (data.messages && Array.isArray(data.messages)) {
            for (const msg of data.messages) {
              this.lastMessageId = Math.max(this.lastMessageId, msg.id);
              console.log('[Signaling Poll] Received message type:', msg.payload?.type, 'for session:', this.sessionId);
              if (this.messageHandler) {
                this.messageHandler(msg.payload);
              } else {
                console.warn('[Signaling Poll] No message handler set!');
              }
            }
          }
        }
      } catch (error) {
        console.error('[Signaling] Poll error:', error);
      }
    }, 500); // Poll every 500ms
  }

  async send(payload: SignalingMessage): Promise<void> {
    try {
      await fetch('/api/signaling', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: this.sessionId, payload }),
      });
    } catch (error) {
      console.error('[Signaling] Send error:', error);
    }
  }

  close() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    this.messageHandler = null;
  }
}

export function useVoiceCall(options: UseVoiceCallOptions = {}) {
  const { onStatusChange, onError, onCallEnded, onRemoteStream } = options;

  // Use refs for callbacks to avoid stale closures
  const onStatusChangeRef = useRef(onStatusChange);
  const onErrorRef = useRef(onError);
  const onCallEndedRef = useRef(onCallEnded);
  const onRemoteStreamRef = useRef(onRemoteStream);

  // Keep refs updated with latest callbacks
  onStatusChangeRef.current = onStatusChange;
  onErrorRef.current = onError;
  onCallEndedRef.current = onCallEnded;
  onRemoteStreamRef.current = onRemoteStream;

  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const channelRef = useRef<SignalingChannel | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);

  // Request microphone access
  const requestMicrophone = useCallback(async (): Promise<MediaStream | null> => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        console.error('getUserMedia not supported');
        return null;
      }
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
          onErrorRef.current?.('마이크 권한이 필요합니다. 브라우저 설정에서 마이크 권한을 허용해주세요.');
        } else if (error.name === 'NotFoundError') {
          onErrorRef.current?.('마이크를 찾을 수 없습니다. 마이크가 연결되어 있는지 확인해주세요.');
        } else {
          onErrorRef.current?.(`마이크 오류: ${error.message}`);
        }
      }
      return null;
    }
  }, []);

  // Create RTCPeerConnection
  const createPeerConnection = useCallback((): RTCPeerConnection => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    pc.onicecandidate = (event) => {
      if (event.candidate && channelRef.current) {
        console.log('[Manager] Sending ICE candidate');
        channelRef.current.send({ type: 'ice-candidate', candidate: event.candidate.toJSON() });
      } else if (!event.candidate) {
        console.log('[Manager] ICE gathering complete');
      }
    };

    pc.ontrack = (event) => {
      console.log('[Manager] Received remote track');
      const [remoteStream] = event.streams;
      remoteStreamRef.current = remoteStream;
      onRemoteStreamRef.current?.(remoteStream);
    };

    pc.onconnectionstatechange = () => {
      console.log('[Manager] Connection state:', pc.connectionState);
      switch (pc.connectionState) {
        case 'connected':
          console.log('[Manager] Call connected!');
          onStatusChangeRef.current?.('connected');
          break;
        case 'disconnected':
        case 'failed':
          console.log('[Manager] Connection failed or disconnected');
          onErrorRef.current?.('연결이 끊어졌습니다.');
          onStatusChangeRef.current?.('failed');
          break;
        case 'closed':
          onStatusChangeRef.current?.('ended');
          break;
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log('[Manager] ICE connection state:', pc.iceConnectionState);
      if (pc.iceConnectionState === 'failed') {
        onErrorRef.current?.('네트워크 연결에 실패했습니다. 다시 시도해주세요.');
        onStatusChangeRef.current?.('failed');
      }
    };

    pc.onicegatheringstatechange = () => {
      console.log('[Manager] ICE gathering state:', pc.iceGatheringState);
    };

    peerConnectionRef.current = pc;
    return pc;
  }, []);

  // Initiate a call (create offer) - manager → kiosk flow
  const initiateCall = useCallback(async (sessionId: string): Promise<boolean> => {
    try {
      console.log('[Manager] initiateCall starting, sessionId:', sessionId);

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
      const channelName = `voice-call-${sessionId}`;
      console.log('[Manager] Setting up signaling channel:', channelName);

      const channel = new SignalingChannel(sessionId);
      channelRef.current = channel;
      sessionIdRef.current = sessionId;

      // Handle incoming messages
      channel.onMessage(async (msg: SignalingMessage) => {
        console.log('[Manager] 📥 Received signaling message:', msg.type);

        if (msg.type === 'call-answered') {
          console.log('[Manager] Kiosk acknowledged call-answered, re-sending offer...');
          if (pc.localDescription?.sdp) {
            console.log('[Manager] 📤 RE-SENDING SDP offer to kiosk');
            channel.send({ type: 'offer', sdp: pc.localDescription.sdp });
          }
          onStatusChangeRef.current?.('connecting');
        } else if (msg.type === 'answer' && 'sdp' in msg) {
          console.log('[Manager] Received answer, current state:', pc.signalingState);
          // Only set remote description if we're in have-local-offer state
          if (pc.signalingState !== 'have-local-offer') {
            console.warn('[Manager] Ignoring answer - wrong signaling state:', pc.signalingState);
            return;
          }
          try {
            await pc.setRemoteDescription({ type: 'answer', sdp: msg.sdp });
            console.log('[Manager] Remote description set, new state:', pc.signalingState);
            for (const candidate of pendingCandidatesRef.current) {
              await pc.addIceCandidate(candidate);
            }
            pendingCandidatesRef.current = [];
            onStatusChangeRef.current?.('connecting');
          } catch (err) {
            console.error('[Manager] Error setting remote description:', err);
          }
        } else if (msg.type === 'ice-candidate' && 'candidate' in msg) {
          console.log('[Manager] Received ICE candidate');
          if (pc.remoteDescription) {
            await pc.addIceCandidate(msg.candidate);
          } else {
            console.log('[Manager] Queuing ICE candidate');
            pendingCandidatesRef.current.push(msg.candidate);
          }
        } else if (msg.type === 'call-ended') {
          console.log('[Manager Dashboard] Kiosk ended call (manager initiated), updating session to ended');
          console.log('[Manager Dashboard] sessionIdRef.current:', sessionIdRef.current);
          console.log('[Manager Dashboard] onCallEndedRef.current:', typeof onCallEndedRef.current);
          // Update database session to ended before cleanup
          if (sessionIdRef.current) {
            await fetch('/api/video-sessions', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                id: sessionIdRef.current,
                status: 'ended',
                ended_at: new Date().toISOString(),
              }),
            }).catch(err => console.error('[Manager] Failed to update session:', err));
            console.log('[Manager] Session updated to ended in database');
          }
          console.log('[Manager] Calling onCallEndedRef callback...');
          onCallEndedRef.current?.(msg.reason);
          console.log('[Manager] Calling cleanup...');
          cleanup();
          console.log('[Manager] Cleanup complete');
        }
      });

      // Subscribe and send offer
      await channel.subscribe();

      // Create and send offer
      console.log('[Manager Dashboard] Creating initial SDP offer...');
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      console.log('[Manager Dashboard] 📤 Sending initial SDP offer to kiosk');
      channel.send({ type: 'offer', sdp: offer.sdp! });

      return true;
    } catch (error) {
      console.error('Failed to initiate call:', error);
      onErrorRef.current?.('통화를 시작할 수 없습니다. 다시 시도해주세요.');
      cleanup();
      return false;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestMicrophone, createPeerConnection]);

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

      // Setup signaling channel
      const channelName = `voice-call-${sessionId}`;
      console.log('[Manager] Setting up signaling channel:', channelName);

      const channel = new SignalingChannel(sessionId);
      channelRef.current = channel;
      sessionIdRef.current = sessionId;

      // Handle incoming messages
      channel.onMessage(async (msg: SignalingMessage) => {
        console.log('[Manager] 📥 Received signaling message:', msg.type);

        if (msg.type === 'offer' && 'sdp' in msg) {
          try {
            console.log('[Manager] Processing offer from kiosk...');
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

            channel.send({ type: 'answer', sdp: answer.sdp! });
            console.log('[Manager] 📤 Answer sent to kiosk');
            onStatusChangeRef.current?.('connecting');
          } catch (err) {
            console.error('[Manager] Error processing offer:', err);
            onErrorRef.current?.('통화 연결에 실패했습니다.');
          }
        } else if (msg.type === 'ice-candidate' && 'candidate' in msg) {
          console.log('[Manager Dashboard] Received ICE candidate');
          if (pc.remoteDescription) {
            await pc.addIceCandidate(msg.candidate);
          } else {
            console.log('[Manager Dashboard] Queuing ICE candidate');
            pendingCandidatesRef.current.push(msg.candidate);
          }
        } else if (msg.type === 'call-ended') {
          console.log('[Manager Dashboard] Kiosk ended call (kiosk initiated), updating session to ended');
          console.log('[Manager Dashboard] sessionIdRef.current:', sessionIdRef.current);
          console.log('[Manager Dashboard] onCallEndedRef.current:', typeof onCallEndedRef.current);
          // Update database session to ended before cleanup
          if (sessionIdRef.current) {
            await fetch('/api/video-sessions', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                id: sessionIdRef.current,
                status: 'ended',
                ended_at: new Date().toISOString(),
              }),
            }).catch(err => console.error('[Manager] Failed to update session:', err));
            console.log('[Manager] Session updated to ended in database');
          }
          console.log('[Manager] Calling onCallEndedRef callback...');
          onCallEndedRef.current?.(msg.reason);
          console.log('[Manager] Calling cleanup...');
          cleanup();
          console.log('[Manager] Cleanup complete');
        }
      });

      // Subscribe and send call-answered signal
      await channel.subscribe();

      console.log('[Manager Dashboard] 📤 Sending call-answered signal to kiosk');
      channel.send({ type: 'call-answered' });

      console.log('[Manager Dashboard] answerCall setup complete, waiting for offer from kiosk...');
      return true;
    } catch (error) {
      console.error('[Manager Dashboard] Failed to answer call:', error);
      onErrorRef.current?.('통화에 응답할 수 없습니다. 다시 시도해주세요.');
      cleanup();
      return false;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestMicrophone, createPeerConnection]);

  // End the call
  const endCall = useCallback((reason: 'declined' | 'ended' | 'timeout' | 'error' = 'ended') => {
    // Send end signal
    channelRef.current?.send({ type: 'call-ended', reason });

    cleanup();
    onStatusChangeRef.current?.('ended');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cleanup all resources
  const cleanup = useCallback(() => {
    // Stop local tracks
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;

    // Close peer connection
    peerConnectionRef.current?.close();
    peerConnectionRef.current = null;

    // Close channel
    if (channelRef.current) {
      channelRef.current.close();
      channelRef.current = null;
    }

    // Clear pending candidates
    pendingCandidatesRef.current = [];

    // Clear remote stream
    remoteStreamRef.current = null;
    sessionIdRef.current = null;
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

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
