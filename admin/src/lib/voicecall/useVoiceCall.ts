'use client';

/**
 * Unified Voice Call Hook
 * Handles WebRTC voice calls for both admin and kiosk
 * Supports both initiator (caller) and responder (answerer) roles
 */

import { useRef, useCallback, useEffect } from 'react';
import {
  ICE_SERVERS,
  CONNECTION_TIMEOUT_MS,
  MAX_CONNECTION_RETRIES,
  DEBUG_PREFIX,
} from './constants';
import { SignalingChannel } from './SignalingChannel';
import type {
  CallStatus,
  SignalingMessage,
  UseVoiceCallOptions,
  UseVoiceCallReturn,
} from './types';

export function useVoiceCall(options: UseVoiceCallOptions): UseVoiceCallReturn {
  const { callerType, onStatusChange, onDurationChange, onError, onRemoteStream, onCallEnded } = options;

  // Refs for callbacks to avoid stale closures
  const onStatusChangeRef = useRef(onStatusChange);
  const onDurationChangeRef = useRef(onDurationChange);
  const onErrorRef = useRef(onError);
  const onRemoteStreamRef = useRef(onRemoteStream);
  const onCallEndedRef = useRef(onCallEnded);

  // Update refs when callbacks change
  useEffect(() => {
    onStatusChangeRef.current = onStatusChange;
    onDurationChangeRef.current = onDurationChange;
    onErrorRef.current = onError;
    onRemoteStreamRef.current = onRemoteStream;
    onCallEndedRef.current = onCallEnded;
  }, [onStatusChange, onDurationChange, onError, onRemoteStream, onCallEnded]);

  // WebRTC refs
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const channelRef = useRef<SignalingChannel | null>(null);
  const sessionIdRef = useRef<string | null>(null);

  // ICE candidate queue (for when remote description is not set yet)
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);

  // State tracking refs
  const isNegotiatingRef = useRef<boolean>(false);
  const hasConnectedRef = useRef<boolean>(false);
  const hasSentOfferRef = useRef<boolean>(false);

  // Timer refs
  const connectionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const debugCountdownRef = useRef<NodeJS.Timeout | null>(null);
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const connectionStartTimeRef = useRef<number>(0);
  const retryCountRef = useRef<number>(0);
  const durationCounterRef = useRef<number>(0);

  // Helper: Log with prefix
  const log = useCallback((message: string, ...args: unknown[]) => {
    console.log(`${DEBUG_PREFIX} [${callerType}] ${message}`, ...args);
  }, [callerType]);

  // Helper: Set call status
  const setStatus = useCallback((status: CallStatus) => {
    log(`📢 Status: ${status}`);
    onStatusChangeRef.current?.(status);
  }, [log]);

  // Helper: Start debug countdown timer
  const startDebugCountdown = useCallback((label: string) => {
    if (debugCountdownRef.current) {
      clearInterval(debugCountdownRef.current);
    }
    connectionStartTimeRef.current = Date.now();
    log(`🕐 ${label} - Starting connection timer`);

    debugCountdownRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - connectionStartTimeRef.current) / 1000);
      const remaining = Math.ceil((CONNECTION_TIMEOUT_MS / 1000) - elapsed);
      const pc = peerConnectionRef.current;
      log(`⏱️ ${label} - Elapsed: ${elapsed}s, Timeout in: ${remaining}s`);
      log(`   📊 Connection: ${pc?.connectionState || 'null'}, ICE: ${pc?.iceConnectionState || 'null'}`);
      log(`   🔄 Retry: ${retryCountRef.current}/${MAX_CONNECTION_RETRIES}`);
    }, 1000);
  }, [log]);

  // Helper: Stop debug countdown timer
  const stopDebugCountdown = useCallback(() => {
    if (debugCountdownRef.current) {
      clearInterval(debugCountdownRef.current);
      debugCountdownRef.current = null;
      log('✅ Connection timer stopped');
    }
  }, [log]);

  // Helper: Start duration counter
  const startDurationCounter = useCallback(() => {
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
    }
    durationCounterRef.current = 0;
    durationIntervalRef.current = setInterval(() => {
      durationCounterRef.current += 1;
      onDurationChangeRef.current?.(durationCounterRef.current);
    }, 1000);
  }, []);

  // Helper: Stop duration counter
  const stopDurationCounter = useCallback(() => {
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }
  }, []);

  // Helper: Set connected status (called when connection is established)
  const setConnectedStatus = useCallback(() => {
    if (hasConnectedRef.current) return;
    hasConnectedRef.current = true;

    log('✅ Call connected!');

    // Clear connection timeout
    if (connectionTimeoutRef.current) {
      clearTimeout(connectionTimeoutRef.current);
      connectionTimeoutRef.current = null;
    }

    stopDebugCountdown();
    retryCountRef.current = 0;
    setStatus('connected');
    startDurationCounter();
  }, [log, setStatus, stopDebugCountdown, startDurationCounter]);

  // Cleanup all resources
  const cleanup = useCallback(() => {
    log('🧹 Cleanup called');

    // Clear timeouts
    if (connectionTimeoutRef.current) {
      clearTimeout(connectionTimeoutRef.current);
      connectionTimeoutRef.current = null;
    }
    stopDebugCountdown();
    stopDurationCounter();

    // Stop local tracks
    localStreamRef.current?.getTracks().forEach((track) => {
      track.stop();
      log(`Stopped track: ${track.kind}`);
    });
    localStreamRef.current = null;

    // Close peer connection
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      log('Closed peer connection');
      peerConnectionRef.current = null;
    }

    // Close signaling channel
    if (channelRef.current) {
      channelRef.current.close();
      log('Closed signaling channel');
      channelRef.current = null;
    }

    // Reset refs
    pendingCandidatesRef.current = [];
    remoteStreamRef.current = null;
    sessionIdRef.current = null;
    isNegotiatingRef.current = false;
    hasConnectedRef.current = false;
    hasSentOfferRef.current = false;
    retryCountRef.current = 0;
    durationCounterRef.current = 0;

    log('Cleanup complete');
  }, [log, stopDebugCountdown, stopDurationCounter]);

  // Request microphone access
  const requestMicrophone = useCallback(async (): Promise<MediaStream | null> => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        log('❌ getUserMedia not supported');
        onErrorRef.current?.('이 브라우저는 음성 통화를 지원하지 않습니다');
        return null;
      }

      log('🎤 Requesting microphone access...');
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
        video: false,
      });
      log('✅ Microphone access granted');
      return stream;
    } catch (error) {
      log('❌ Microphone access denied:', error);
      onErrorRef.current?.('마이크 접근이 거부되었습니다. 브라우저 설정을 확인해주세요.');
      return null;
    }
  }, [log]);

  // Create peer connection with all handlers
  const createPeerConnection = useCallback((): RTCPeerConnection => {
    log('Creating peer connection with ICE servers:', ICE_SERVERS.length);
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate && channelRef.current) {
        // Parse candidate type for logging (host, srflx, relay)
        const candidateStr = event.candidate.candidate;
        const typeMatch = candidateStr.match(/typ (\w+)/);
        const candidateType = typeMatch ? typeMatch[1] : 'unknown';
        log(`📤 Sending ICE candidate: type=${candidateType}, protocol=${event.candidate.protocol || 'unknown'}`);
        channelRef.current.send({ type: 'ice-candidate', candidate: event.candidate.toJSON() });
      } else if (!event.candidate) {
        log('📤 ICE gathering complete (null candidate)');
      }
    };

    // Handle remote track
    pc.ontrack = (event) => {
      log(`🎧 Received remote track: kind=${event.track.kind}, enabled=${event.track.enabled}`);
      const [remoteStream] = event.streams;
      remoteStreamRef.current = remoteStream;
      onRemoteStreamRef.current?.(remoteStream);
    };

    // Handle connection state changes
    pc.onconnectionstatechange = () => {
      log(`🟣 Connection state: ${pc.connectionState}`);
      switch (pc.connectionState) {
        case 'connected':
          // Log selected candidate pair info if available
          pc.getStats().then(stats => {
            stats.forEach(report => {
              if (report.type === 'candidate-pair' && report.state === 'succeeded') {
                log(`✅ Connected via: local=${report.localCandidateId}, remote=${report.remoteCandidateId}`);
              }
              if (report.type === 'local-candidate' || report.type === 'remote-candidate') {
                log(`   Candidate: type=${report.candidateType}, protocol=${report.protocol}, address=${report.address || 'hidden'}`);
              }
            });
          }).catch(() => {});
          setConnectedStatus();
          break;
        case 'disconnected':
          log('⚠️ Connection disconnected (waiting for failed state if permanent)');
          break;
        case 'failed':
          log('❌ Connection failed - could not establish P2P connection');
          log('   This may be due to: firewall blocking, NAT issues, or TURN server unavailable');
          onErrorRef.current?.('연결이 끊어졌습니다.');
          setStatus('failed');
          break;
        case 'closed':
          log('⚪ Connection closed');
          setStatus('ended');
          break;
      }
    };

    // Handle ICE connection state changes (more reliable in some browsers)
    pc.oniceconnectionstatechange = () => {
      log(`🔵 ICE state: ${pc.iceConnectionState}`);
      if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        setConnectedStatus();
      } else if (pc.iceConnectionState === 'failed') {
        log('❌ ICE connection failed - no valid candidate pair found');
        onErrorRef.current?.('네트워크 연결에 실패했습니다.');
        setStatus('failed');
      } else if (pc.iceConnectionState === 'disconnected') {
        log('⚠️ ICE disconnected - connection may recover or fail');
      }
    };

    pc.onicegatheringstatechange = () => {
      log(`ICE gathering: ${pc.iceGatheringState}`);
      if (pc.iceGatheringState === 'complete') {
        log('✅ ICE gathering complete');
      }
    };

    // Log ICE candidate errors
    pc.onicecandidateerror = (event) => {
      log(`❌ ICE candidate error: ${event.errorCode} - ${event.errorText || 'unknown'}, url=${event.url || 'unknown'}`);
    };

    peerConnectionRef.current = pc;
    return pc;
  }, [log, setConnectedStatus, setStatus]);

  // Handle incoming signaling messages
  const handleSignalingMessage = useCallback(async (msg: SignalingMessage, role: 'initiator' | 'responder') => {
    const pc = peerConnectionRef.current;
    if (!pc) {
      log('⚠️ No peer connection, ignoring message:', msg.type);
      return;
    }

    log(`📥 Handling message: ${msg.type} (role: ${role})`);

    if (msg.type === 'call-answered') {
      // Only initiator handles call-answered (responder sends it)
      if (role !== 'initiator') {
        log('⚠️ Responder ignoring call-answered');
        return;
      }

      // Check if already connected
      if (hasConnectedRef.current) {
        log('⚠️ Already connected, ignoring call-answered');
        return;
      }

      // Check if already sent offer
      if (hasSentOfferRef.current) {
        log('⚠️ Already sent offer, ignoring duplicate call-answered');
        return;
      }

      log('📞 Other party answered, creating offer...');
      hasSentOfferRef.current = true;

      try {
        // Create and send offer
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        log('📤 Sending offer');
        channelRef.current?.send({ type: 'offer', sdp: offer.sdp! });
        setStatus('connecting');

        // Start debug countdown
        startDebugCountdown(`${callerType} → other (attempt ${retryCountRef.current + 1})`);

        // Start connection timeout for retry
        if (connectionTimeoutRef.current) {
          clearTimeout(connectionTimeoutRef.current);
        }
        log(`⏱️ Starting ${CONNECTION_TIMEOUT_MS / 1000}s connection timeout...`);
        connectionTimeoutRef.current = setTimeout(() => {
          if (!hasConnectedRef.current) {
            retryCountRef.current++;
            log(`⏰ TIMEOUT - Retry ${retryCountRef.current}/${MAX_CONNECTION_RETRIES}`);

            if (retryCountRef.current > MAX_CONNECTION_RETRIES) {
              log('❌ MAX RETRIES REACHED');
              stopDebugCountdown();
              onErrorRef.current?.('연결에 실패했습니다. 다시 시도해주세요.');
              setStatus('failed');
              cleanup();
              return;
            }

            // Reset and retry
            hasSentOfferRef.current = false;
            // Send call-answered to trigger other party to resend
            channelRef.current?.send({ type: 'call-answered' });
          }
        }, CONNECTION_TIMEOUT_MS);
      } catch (error) {
        log('❌ Error creating offer:', error);
        hasSentOfferRef.current = false;
      }
    } else if (msg.type === 'offer' && 'sdp' in msg) {
      // Only responder handles offer (initiator sends it)
      if (role !== 'responder') {
        log('⚠️ Initiator ignoring offer');
        return;
      }

      // Check if already connected
      if (hasConnectedRef.current) {
        log('⚠️ Already connected, ignoring offer');
        return;
      }

      // Check connection state
      if (pc.connectionState === 'connected' || pc.iceConnectionState === 'connected') {
        log('⚠️ Connection already established, ignoring offer');
        hasConnectedRef.current = true;
        return;
      }

      // Check if already negotiating
      if (isNegotiatingRef.current) {
        log('⚠️ Already negotiating, ignoring offer');
        return;
      }

      // Only process if in stable state
      if (pc.signalingState !== 'stable') {
        log(`⚠️ Cannot process offer in state: ${pc.signalingState}`);
        return;
      }

      log('Processing offer...');
      isNegotiatingRef.current = true;

      try {
        // Set remote description
        await pc.setRemoteDescription({ type: 'offer', sdp: msg.sdp });
        log('✅ Remote description set');

        // Add pending ICE candidates
        if (pendingCandidatesRef.current.length > 0) {
          log(`Adding ${pendingCandidatesRef.current.length} pending ICE candidates...`);
          for (const candidate of pendingCandidatesRef.current) {
            await pc.addIceCandidate(candidate);
          }
          pendingCandidatesRef.current = [];
        }

        // Create and send answer
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        log('📤 Sending answer');
        channelRef.current?.send({ type: 'answer', sdp: answer.sdp! });
        setStatus('connecting');

        isNegotiatingRef.current = false;

        // Start debug countdown
        startDebugCountdown(`other → ${callerType} (attempt ${retryCountRef.current + 1})`);

        // Start connection timeout for retry
        if (connectionTimeoutRef.current) {
          clearTimeout(connectionTimeoutRef.current);
        }
        log(`⏱️ Starting ${CONNECTION_TIMEOUT_MS / 1000}s connection timeout...`);
        connectionTimeoutRef.current = setTimeout(() => {
          if (!hasConnectedRef.current) {
            retryCountRef.current++;
            log(`⏰ TIMEOUT - Retry ${retryCountRef.current}/${MAX_CONNECTION_RETRIES}`);

            if (retryCountRef.current > MAX_CONNECTION_RETRIES) {
              log('❌ MAX RETRIES REACHED');
              stopDebugCountdown();
              onErrorRef.current?.('연결에 실패했습니다. 다시 시도해주세요.');
              setStatus('failed');
              cleanup();
              return;
            }

            // Resend call-answered to trigger new offer
            log('🔄 Resending call-answered to trigger new offer');
            channelRef.current?.send({ type: 'call-answered' });
          }
        }, CONNECTION_TIMEOUT_MS);
      } catch (error) {
        log('❌ Error processing offer:', error);
        isNegotiatingRef.current = false;
        onErrorRef.current?.('통화 연결에 실패했습니다.');
      }
    } else if (msg.type === 'answer' && 'sdp' in msg) {
      // Only initiator handles answer (responder sends it)
      if (role !== 'initiator') {
        log('⚠️ Responder ignoring answer');
        return;
      }

      // Only set remote description if we're in have-local-offer state
      if (pc.signalingState !== 'have-local-offer') {
        log(`⚠️ Ignoring answer - wrong state: ${pc.signalingState}`);
        return;
      }

      try {
        log('Setting remote description from answer...');
        await pc.setRemoteDescription({ type: 'answer', sdp: msg.sdp });
        log('✅ Remote description set');

        // Add pending ICE candidates
        if (pendingCandidatesRef.current.length > 0) {
          log(`Adding ${pendingCandidatesRef.current.length} pending ICE candidates...`);
          for (const candidate of pendingCandidatesRef.current) {
            await pc.addIceCandidate(candidate);
          }
          pendingCandidatesRef.current = [];
        }
      } catch (error) {
        log('❌ Error setting remote description:', error);
      }
    } else if (msg.type === 'ice-candidate' && 'candidate' in msg) {
      // Both sides handle ICE candidates
      // Parse candidate type for logging
      const candidateStr = msg.candidate?.candidate || '';
      const typeMatch = candidateStr.match(/typ (\w+)/);
      const candidateType = typeMatch ? typeMatch[1] : 'unknown';

      if (pc.remoteDescription) {
        log(`📥 Adding ICE candidate: type=${candidateType}`);
        try {
          await pc.addIceCandidate(msg.candidate);
        } catch (err) {
          log(`❌ Error adding ICE candidate: ${err}`);
        }
      } else {
        log(`📥 Queuing ICE candidate: type=${candidateType} (no remote description yet)`);
        pendingCandidatesRef.current.push(msg.candidate);
      }
    } else if (msg.type === 'call-ended') {
      log('📞 Other party ended call');
      onCallEndedRef.current?.(msg.reason);
      setStatus('ended');
      cleanup();
    }
  }, [callerType, log, setStatus, startDebugCountdown, stopDebugCountdown, cleanup]);

  // Initiate a call (caller role)
  const initiateCall = useCallback(async (sessionId: string): Promise<boolean> => {
    try {
      log(`📞 Initiating call, session: ${sessionId}`);
      sessionIdRef.current = sessionId;

      // Get microphone access
      const stream = await requestMicrophone();
      if (!stream) {
        return false;
      }
      localStreamRef.current = stream;

      // Create peer connection
      const pc = createPeerConnection();

      // Add local tracks
      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream);
      });

      // Setup signaling channel
      const channel = new SignalingChannel(sessionId, callerType);
      channelRef.current = channel;

      // Handle incoming messages as initiator
      channel.onMessage(async (msg) => {
        await handleSignalingMessage(msg, 'initiator');
      });

      // Clear old messages and subscribe
      await channel.clearMessages();
      await channel.subscribe();

      log('Waiting for other party to answer...');
      setStatus('ringing');

      return true;
    } catch (error) {
      log('❌ Failed to initiate call:', error);
      onErrorRef.current?.('통화를 시작할 수 없습니다.');
      cleanup();
      return false;
    }
  }, [callerType, log, requestMicrophone, createPeerConnection, handleSignalingMessage, setStatus, cleanup]);

  // Answer an incoming call (responder role)
  const answerCall = useCallback(async (sessionId: string): Promise<boolean> => {
    try {
      log(`📞 Answering call, session: ${sessionId}`);
      sessionIdRef.current = sessionId;

      // Get microphone access
      const stream = await requestMicrophone();
      if (!stream) {
        return false;
      }
      localStreamRef.current = stream;

      // Create peer connection
      const pc = createPeerConnection();

      // Add local tracks
      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream);
      });

      // Setup signaling channel
      const channel = new SignalingChannel(sessionId, callerType);
      channelRef.current = channel;

      // Handle incoming messages as responder
      channel.onMessage(async (msg) => {
        await handleSignalingMessage(msg, 'responder');
      });

      // Clear old messages and subscribe
      await channel.clearMessages();
      await channel.subscribe();

      // Send call-answered signal immediately
      log('📤 Sending call-answered signal');
      await channel.send({ type: 'call-answered' });

      setStatus('connecting');

      return true;
    } catch (error) {
      log('❌ Failed to answer call:', error);
      onErrorRef.current?.('통화에 응답할 수 없습니다.');
      cleanup();
      return false;
    }
  }, [callerType, log, requestMicrophone, createPeerConnection, handleSignalingMessage, setStatus, cleanup]);

  // End the call
  const endCall = useCallback((reason: 'declined' | 'ended' | 'timeout' | 'error' = 'ended') => {
    log(`📞 Ending call, reason: ${reason}`);

    // Send end signal
    if (channelRef.current && sessionIdRef.current) {
      channelRef.current.send({ type: 'call-ended', reason }).catch((err) => {
        log('Failed to send call-ended signal:', err);
      });
    }

    setStatus('ended');
    cleanup();
  }, [log, setStatus, cleanup]);

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
