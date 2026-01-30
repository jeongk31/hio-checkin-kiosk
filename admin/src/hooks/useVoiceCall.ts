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
  private sender: string;
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private messageHandler: ((msg: SignalingMessage) => void) | null = null;
  private lastMessageId: number = 0;

  constructor(sessionId: string, sender: string = 'admin') {
    this.sessionId = sessionId;
    this.sender = sender;
  }

  onMessage(handler: (msg: SignalingMessage) => void) {
    this.messageHandler = handler;
  }

  async subscribe(): Promise<void> {
    // Start polling for messages, excluding our own messages
    this.pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`/api/signaling?sessionId=${this.sessionId}&lastId=${this.lastMessageId}&excludeSender=${this.sender}`);
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
    }, 250); // Poll every 250ms for faster real-time response
  }

  async send(payload: SignalingMessage): Promise<void> {
    try {
      await fetch('/api/signaling', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: this.sessionId, payload, sender: this.sender }),
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

  // Clear all messages for this session (useful when starting a new call)
  async clearMessages(): Promise<void> {
    try {
      await fetch('/api/signaling', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: this.sessionId }),
      });
      console.log('[Signaling] Cleared old messages for session:', this.sessionId);
    } catch (error) {
      console.error('[Signaling] Failed to clear messages:', error);
    }
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
  const isNegotiatingRef = useRef<boolean>(false);
  const makingOfferRef = useRef<boolean>(false);
  const connectionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const debugCountdownRef = useRef<NodeJS.Timeout | null>(null);
  const connectionStartTimeRef = useRef<number>(0);
  const retryCountRef = useRef<number>(0);
  const hasConnectedRef = useRef<boolean>(false);
  const MAX_CONNECTION_RETRIES = 3;
  const CONNECTION_TIMEOUT_MS = 15000; // 15 seconds

  // Debug: Log connection state every second when connecting
  const startDebugCountdown = useCallback((label: string) => {
    if (debugCountdownRef.current) {
      clearInterval(debugCountdownRef.current);
    }
    connectionStartTimeRef.current = Date.now();
    console.log(`[Manager Debug] 🕐 ${label} - Starting connection timer`);

    debugCountdownRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - connectionStartTimeRef.current) / 1000);
      const remaining = Math.ceil((CONNECTION_TIMEOUT_MS / 1000) - elapsed);
      const pc = peerConnectionRef.current;
      console.log(`[Manager Debug] ⏱️ ${label} - Elapsed: ${elapsed}s, Retry in: ${remaining}s`);
      console.log(`[Manager Debug]   📊 Connection: ${pc?.connectionState || 'null'}, ICE: ${pc?.iceConnectionState || 'null'}, Signaling: ${pc?.signalingState || 'null'}`);
      console.log(`[Manager Debug]   🔄 Retry count: ${retryCountRef.current}/${MAX_CONNECTION_RETRIES}`);
    }, 1000);
  }, []);

  const stopDebugCountdown = useCallback(() => {
    if (debugCountdownRef.current) {
      clearInterval(debugCountdownRef.current);
      debugCountdownRef.current = null;
      console.log('[Manager Debug] ✅ Connection timer stopped');
    }
  }, []);

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
      console.log('[Manager Debug] 🟣 Connection state changed:', pc.connectionState);
      switch (pc.connectionState) {
        case 'connected':
          console.log('[Manager Debug] ✅ Call connected! Stopping timers...');
          // Clear connection timeout on successful connection
          if (connectionTimeoutRef.current) {
            clearTimeout(connectionTimeoutRef.current);
            connectionTimeoutRef.current = null;
          }
          stopDebugCountdown();
          hasConnectedRef.current = true;
          retryCountRef.current = 0;
          onStatusChangeRef.current?.('connected');
          break;
        case 'disconnected':
          // Don't treat disconnected as reconnecting - WebRTC connections can briefly
          // go through disconnected during normal ICE negotiation after being connected.
          console.log('[Manager Debug] ⚠️ Connection disconnected (waiting for failed state if permanent)');
          break;
        case 'failed':
          console.log('[Manager Debug] ❌ Connection failed');
          onErrorRef.current?.('연결이 끊어졌습니다.');
          onStatusChangeRef.current?.('failed');
          break;
        case 'closed':
          console.log('[Manager Debug] ⚪ Connection closed');
          onStatusChangeRef.current?.('ended');
          break;
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log('[Manager Debug] 🔵 ICE connection state changed:', pc.iceConnectionState);
      if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        console.log('[Manager Debug] ✅ ICE connection established!');
        // Clear connection timeout on successful ICE connection
        if (connectionTimeoutRef.current) {
          clearTimeout(connectionTimeoutRef.current);
          connectionTimeoutRef.current = null;
        }
        stopDebugCountdown();
        hasConnectedRef.current = true;
        retryCountRef.current = 0;
        onStatusChangeRef.current?.('connected');
      } else if (pc.iceConnectionState === 'failed') {
        console.log('[Manager Debug] ❌ ICE connection failed');
        onErrorRef.current?.('네트워크 연결에 실패했습니다. 다시 시도해주세요.');
        onStatusChangeRef.current?.('failed');
      } else if (pc.iceConnectionState === 'disconnected') {
        console.log('[Manager Debug] ⚠️ ICE connection disconnected');
      }
    };

    pc.onicegatheringstatechange = () => {
      console.log('[Manager Debug] ICE gathering state:', pc.iceGatheringState);
    };

    peerConnectionRef.current = pc;
    return pc;
  }, [stopDebugCountdown]);

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

      // Track if we've sent an offer
      let hassentOffer = false;

      // Handle incoming messages
      channel.onMessage(async (msg: SignalingMessage) => {
        console.log('[Manager Debug] 📥 Received signaling message:', msg.type);

        if (msg.type === 'call-answered') {
          // Kiosk is ready - NOW send the offer
          if (hassentOffer && !connectionTimeoutRef.current) {
            console.log('[Manager Debug] Already sent offer, ignoring duplicate call-answered');
            return;
          }

          // Function to create and send offer (can be called for retries)
          const createAndSendOffer = async (isRetry: boolean = false) => {
            if (hasConnectedRef.current) {
              console.log('[Manager Debug] Already connected, skipping offer creation');
              return;
            }

            if (isRetry) {
              retryCountRef.current++;
              console.log(`[Manager Debug] 🔄 RETRY ${retryCountRef.current}/${MAX_CONNECTION_RETRIES} - Recreating peer connection...`);

              if (retryCountRef.current > MAX_CONNECTION_RETRIES) {
                console.log('[Manager Debug] ❌ MAX RETRIES REACHED - Ending call');
                stopDebugCountdown();
                onErrorRef.current?.('연결에 실패했습니다. 다시 시도해주세요.');
                onStatusChangeRef.current?.('failed');
                cleanup();
                return;
              }
            }

            console.log('[Manager Debug] Kiosk is ready, creating and sending offer...');
            hassentOffer = true;
            try {
              const currentPc = peerConnectionRef.current;
              console.log('[Manager Debug]   Current signaling state:', currentPc?.signalingState);
              console.log('[Manager Debug]   Current connection state:', currentPc?.connectionState);
              if (!currentPc || currentPc.signalingState !== 'stable') {
                // Need to recreate peer connection for retry
                if (isRetry && localStreamRef.current) {
                  console.log('[Manager Debug] Creating new peer connection for retry...');
                  const newPc = createPeerConnection();
                  localStreamRef.current.getTracks().forEach((track) => {
                    newPc.addTrack(track, localStreamRef.current!);
                  });
                  pendingCandidatesRef.current = [];
                  console.log('[Manager Debug] New peer connection created');
                }
              }

              const pcToUse = peerConnectionRef.current;
              if (!pcToUse) {
                console.log('[Manager Debug] ⚠️ No peer connection available');
                return;
              }

              console.log('[Manager Debug] Creating offer...');
              const offer = await pcToUse.createOffer();
              await pcToUse.setLocalDescription(offer);
              console.log('[Manager Debug] 📤 Sending offer to kiosk');
              channel.send({ type: 'offer', sdp: offer.sdp! });
              onStatusChangeRef.current?.('connecting');

              // Start debug countdown
              startDebugCountdown(`Manager→Kiosk (attempt ${retryCountRef.current + 1})`);

              // Start connection timeout for retry
              if (connectionTimeoutRef.current) {
                clearTimeout(connectionTimeoutRef.current);
              }
              console.log(`[Manager Debug] ⏱️ Starting ${CONNECTION_TIMEOUT_MS/1000}s connection timeout...`);
              connectionTimeoutRef.current = setTimeout(() => {
                if (!hasConnectedRef.current) {
                  console.log('[Manager Debug] ⏰ CONNECTION TIMEOUT - Will retry...');
                  hassentOffer = false;
                  createAndSendOffer(true);
                }
              }, CONNECTION_TIMEOUT_MS);
            } catch (err) {
              console.error('[Manager Debug] ❌ Failed to create/send offer:', err);
              hassentOffer = false;
            }
          };

          // Initial offer creation
          await createAndSendOffer(false);
        } else if (msg.type === 'answer' && 'sdp' in msg) {
          console.log('[Manager Debug] 📨 Received answer');
          console.log('[Manager Debug]   Current signaling state:', pc.signalingState);
          console.log('[Manager Debug]   Current connection state:', pc.connectionState);
          console.log('[Manager Debug]   Current ICE state:', pc.iceConnectionState);
          // Only set remote description if we're in have-local-offer state
          if (pc.signalingState !== 'have-local-offer') {
            console.warn('[Manager Debug] ⚠️ Ignoring answer - wrong signaling state:', pc.signalingState);
            return;
          }
          try {
            console.log('[Manager Debug] Setting remote description...');
            await pc.setRemoteDescription({ type: 'answer', sdp: msg.sdp });
            console.log('[Manager Debug] ✅ Remote description set, new state:', pc.signalingState);
            const pendingCount = pendingCandidatesRef.current.length;
            if (pendingCount > 0) {
              console.log(`[Manager Debug] Adding ${pendingCount} pending ICE candidates...`);
            }
            for (const candidate of pendingCandidatesRef.current) {
              await pc.addIceCandidate(candidate);
            }
            pendingCandidatesRef.current = [];
            // Don't set 'connecting' here - let pc.onconnectionstatechange handle status updates
          } catch (err) {
            console.error('[Manager Debug] ❌ Error setting remote description:', err);
          }
        } else if (msg.type === 'ice-candidate' && 'candidate' in msg) {
          if (pc.remoteDescription) {
            console.log('[Manager Debug] 📥 Adding ICE candidate');
            await pc.addIceCandidate(msg.candidate);
          } else {
            console.log('[Manager Debug] 📥 Queuing ICE candidate (no remote description yet)');
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

      // Clear any old signaling messages before subscribing
      await channel.clearMessages();

      // Subscribe and wait for kiosk to answer (kiosk will send 'call-answered' when ready)
      await channel.subscribe();
      console.log('[Manager] Subscribed, waiting for kiosk to answer...');

      // Don't send offer yet - wait for 'call-answered' from kiosk
      // The offer will be sent in the onMessage handler when 'call-answered' is received

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
        console.log('[Manager Debug] 📥 Received signaling message:', msg.type);

        if (msg.type === 'offer' && 'sdp' in msg) {
          try {
            const currentPc = peerConnectionRef.current;
            if (!currentPc) {
              console.log('[Manager Debug] ⚠️ No peer connection available');
              return;
            }

            // Check if we can accept an offer right now
            const currentState = currentPc.signalingState;
            const connectionState = currentPc.connectionState;
            console.log('[Manager Debug] 📨 Received SDP offer');
            console.log('[Manager Debug]   Current signaling state:', currentState);
            console.log('[Manager Debug]   Current connection state:', connectionState);
            console.log('[Manager Debug]   Current ICE state:', currentPc.iceConnectionState);

            // Ignore offer if we're already negotiating
            if (isNegotiatingRef.current) {
              console.log('[Manager Debug] ⚠️ Already negotiating, ignoring offer');
              return;
            }

            // Ignore offer if connection is already established
            if (connectionState === 'connected' || hasConnectedRef.current) {
              console.log('[Manager Debug] ⚠️ Already connected, ignoring offer');
              return;
            }

            // Only process offer if in stable state
            if (currentState !== 'stable') {
              console.log('[Manager Debug] ⚠️ Cannot process offer in state:', currentState, '- ignoring');
              return;
            }

            console.log('[Manager Debug] Processing offer from kiosk...');
            isNegotiatingRef.current = true;

            console.log('[Manager Debug] Setting remote description...');
            await currentPc.setRemoteDescription({ type: 'offer', sdp: msg.sdp });
            console.log('[Manager Debug] ✅ Remote description set');

            // Add any pending ICE candidates
            const pendingCount = pendingCandidatesRef.current.length;
            if (pendingCount > 0) {
              console.log(`[Manager Debug] Adding ${pendingCount} pending ICE candidates...`);
            }
            for (const candidate of pendingCandidatesRef.current) {
              await currentPc.addIceCandidate(candidate);
            }
            pendingCandidatesRef.current = [];

            // Create and send answer
            console.log('[Manager Debug] Creating answer...');
            const answer = await currentPc.createAnswer();
            await currentPc.setLocalDescription(answer);
            console.log('[Manager Debug] 📤 Sending answer to kiosk');

            channel.send({ type: 'answer', sdp: answer.sdp! });
            onStatusChangeRef.current?.('connecting');

            isNegotiatingRef.current = false;

            // Start debug countdown
            startDebugCountdown(`Kiosk→Manager (attempt ${retryCountRef.current + 1})`);

            // Start connection timeout for retry
            if (connectionTimeoutRef.current) {
              clearTimeout(connectionTimeoutRef.current);
            }
            console.log(`[Manager Debug] ⏱️ Starting ${CONNECTION_TIMEOUT_MS/1000}s connection timeout...`);
            connectionTimeoutRef.current = setTimeout(() => {
              if (!hasConnectedRef.current) {
                retryCountRef.current++;
                console.log(`[Manager Debug] ⏰ CONNECTION TIMEOUT - Retry ${retryCountRef.current}/${MAX_CONNECTION_RETRIES}`);

                if (retryCountRef.current > MAX_CONNECTION_RETRIES) {
                  console.log('[Manager Debug] ❌ MAX RETRIES REACHED - Ending call');
                  stopDebugCountdown();
                  onErrorRef.current?.('연결에 실패했습니다. 다시 시도해주세요.');
                  onStatusChangeRef.current?.('failed');
                  cleanup();
                  return;
                }

                // Resend call-answered to trigger kiosk to resend offer
                console.log('[Manager Debug] 🔄 Resending call-answered to trigger new offer');
                channel.send({ type: 'call-answered' });
              }
            }, CONNECTION_TIMEOUT_MS);
          } catch (err) {
            console.error('[Manager Debug] ❌ Error processing offer:', err);
            isNegotiatingRef.current = false;
            onErrorRef.current?.('통화 연결에 실패했습니다.');
          }
        } else if (msg.type === 'ice-candidate' && 'candidate' in msg) {
          if (pc.remoteDescription) {
            console.log('[Manager Debug] 📥 Adding ICE candidate');
            await pc.addIceCandidate(msg.candidate);
          } else {
            console.log('[Manager Debug] 📥 Queuing ICE candidate (no remote description yet)');
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

      // Clear any old signaling messages before subscribing
      await channel.clearMessages();

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
    console.log('[Manager] endCall called with reason:', reason);
    
    // Send end signal
    if (channelRef.current && sessionIdRef.current) {
      console.log('[Manager] Sending call-ended signal');
      channelRef.current.send({ type: 'call-ended', reason });
    }

    cleanup();
    onStatusChangeRef.current?.('ended');
    console.log('[Manager] endCall complete');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cleanup all resources
  const cleanup = useCallback(() => {
    console.log('[Manager Debug] 🧹 Cleanup called');

    // Clear connection timeout
    if (connectionTimeoutRef.current) {
      clearTimeout(connectionTimeoutRef.current);
      connectionTimeoutRef.current = null;
    }
    stopDebugCountdown();

    // Stop local tracks
    localStreamRef.current?.getTracks().forEach((track) => {
      track.stop();
      console.log('[Manager Debug] Stopped local track:', track.kind);
    });
    localStreamRef.current = null;

    // Close peer connection
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      console.log('[Manager Debug] Closed peer connection');
      peerConnectionRef.current = null;
    }

    // Close channel
    if (channelRef.current) {
      channelRef.current.close();
      console.log('[Manager Debug] Closed signaling channel');
      channelRef.current = null;
    }

    // Clear pending candidates and refs
    pendingCandidatesRef.current = [];
    remoteStreamRef.current = null;
    sessionIdRef.current = null;
    isNegotiatingRef.current = false;
    makingOfferRef.current = false;
    retryCountRef.current = 0;
    hasConnectedRef.current = false;

    console.log('[Manager Debug] Cleanup complete');
  }, [stopDebugCountdown]);

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
