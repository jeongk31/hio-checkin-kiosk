/**
 * Voice Call Constants
 * Shared configuration for WebRTC voice calls between admin and kiosk
 */

// AWS Seoul TURN server configuration
// This improves call reliability from ~80-90% (STUN-only) to ~100%
const TURN_SERVER = {
  url: 'turn:43.201.28.4:3478',
  username: 'hio_turn',
  credential: 'Kiosk2024SecureTurn',
};

// Build ICE servers list
function buildIceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [
    // Google STUN servers (for direct P2P when possible)
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    // AWS Seoul TURN server (for relay when P2P fails - cellular, firewalls, etc.)
    {
      urls: TURN_SERVER.url,
      username: TURN_SERVER.username,
      credential: TURN_SERVER.credential,
    },
  ];

  console.log('[VoiceCall] ICE servers configured:', servers.length, '(including TURN relay)');
  console.log('[VoiceCall] TURN server:', TURN_SERVER.url);

  return servers;
}

// ICE servers for NAT/firewall traversal
export const ICE_SERVERS: RTCIceServer[] = buildIceServers();

// Connection timeout before retry (15 seconds)
export const CONNECTION_TIMEOUT_MS = 15000;

// Maximum number of connection retries
export const MAX_CONNECTION_RETRIES = 3;

// Signaling channel poll interval (250ms for fast response)
export const SIGNALING_POLL_INTERVAL = 250;

// Debug log prefix for easy filtering
export const DEBUG_PREFIX = '[VoiceCall]';
