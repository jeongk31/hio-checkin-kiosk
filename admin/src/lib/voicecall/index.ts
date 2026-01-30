/**
 * Voice Call Library
 * Unified WebRTC voice call system for admin and kiosk
 */

// Constants
export {
  ICE_SERVERS,
  CONNECTION_TIMEOUT_MS,
  MAX_CONNECTION_RETRIES,
  SIGNALING_POLL_INTERVAL,
  DEBUG_PREFIX,
} from './constants';

// Types
export type {
  CallerType,
  CallRole,
  CallStatus,
  SignalingMessage,
  UseVoiceCallOptions,
  UseVoiceCallReturn,
  SignalingMessageRecord,
} from './types';

// Signaling Channel
export { SignalingChannel } from './SignalingChannel';

// Main Hook
export { useVoiceCall } from './useVoiceCall';
