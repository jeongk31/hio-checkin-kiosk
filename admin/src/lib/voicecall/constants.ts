/**
 * Voice Call Constants
 * Shared configuration for WebRTC voice calls between admin and kiosk
 */

// STUN and TURN servers for NAT traversal
// TURN servers are needed when direct P2P connection fails (common in AWS/cloud environments)
export const ICE_SERVERS: RTCIceServer[] = [
  // Google STUN servers
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },
  // Additional STUN servers for redundancy
  { urls: 'stun:stun.stunprotocol.org:3478' },
  // OpenRelay TURN servers (free, for testing/development)
  // These provide relay when direct P2P fails
  {
    urls: 'turn:openrelay.metered.ca:80',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turn:openrelay.metered.ca:443',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turn:openrelay.metered.ca:443?transport=tcp',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
];

// Connection timeout before retry (15 seconds)
export const CONNECTION_TIMEOUT_MS = 15000;

// Maximum number of connection retries
export const MAX_CONNECTION_RETRIES = 3;

// Signaling channel poll interval (250ms for fast response)
export const SIGNALING_POLL_INTERVAL = 250;

// Debug log prefix for easy filtering
export const DEBUG_PREFIX = '[VoiceCall]';
