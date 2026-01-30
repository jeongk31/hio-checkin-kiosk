/**
 * Voice Call Types
 * Shared type definitions for WebRTC voice calls
 */

// Who is making the call
export type CallerType = 'admin' | 'kiosk';

// Role in the call (who initiates vs responds)
export type CallRole = 'initiator' | 'responder';

// Call status states
export type CallStatus =
  | 'idle'        // No active call
  | 'ringing'     // Waiting for other party to answer
  | 'connecting'  // WebRTC negotiation in progress
  | 'connected'   // Call is active
  | 'ended'       // Call ended normally
  | 'failed';     // Call failed

// Signaling message types
export type SignalingMessage =
  | { type: 'offer'; sdp: string }
  | { type: 'answer'; sdp: string }
  | { type: 'ice-candidate'; candidate: RTCIceCandidateInit }
  | { type: 'call-answered' }
  | { type: 'call-ended'; reason: 'declined' | 'ended' | 'timeout' | 'error' };

// Options for useVoiceCall hook
export interface UseVoiceCallOptions {
  // Who is using this hook (admin or kiosk)
  callerType: CallerType;

  // Callback when call status changes
  onStatusChange?: (status: CallStatus) => void;

  // Callback when call duration updates (every second when connected)
  onDurationChange?: (seconds: number) => void;

  // Callback when an error occurs
  onError?: (error: string) => void;

  // Callback when remote audio stream is received
  onRemoteStream?: (stream: MediaStream) => void;

  // Callback when call ends
  onCallEnded?: (reason: string) => void;
}

// Return type for useVoiceCall hook
export interface UseVoiceCallReturn {
  // Start an outgoing call (caller creates session, waits for answer)
  initiateCall: (sessionId: string) => Promise<boolean>;

  // Answer an incoming call (responder sends call-answered, receives offer)
  answerCall: (sessionId: string) => Promise<boolean>;

  // End the current call
  endCall: (reason?: 'declined' | 'ended' | 'timeout' | 'error') => void;

  // Clean up all resources
  cleanup: () => void;

  // Get current local stream
  getLocalStream: () => MediaStream | null;

  // Get current remote stream
  getRemoteStream: () => MediaStream | null;

  // Get current session ID
  getSessionId: () => string | null;
}

// Signaling message from database
export interface SignalingMessageRecord {
  id: number;
  session_id: string;
  sender: string | null;
  payload: SignalingMessage;
  created_at: string;
}
