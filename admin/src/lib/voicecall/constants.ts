/**
 * Voice Call Constants
 * Shared configuration for WebRTC voice calls between admin and kiosk
 */

// STUN and TURN servers for NAT traversal
// TURN servers are REQUIRED when:
// - Behind corporate firewall
// - On LTE/mobile networks (CGNAT)
// - In cloud environments like AWS
//
// TCP transport on port 443 is critical for firewall bypass
export const ICE_SERVERS: RTCIceServer[] = [
  // Google STUN servers (for NAT discovery, but often blocked on restricted networks)
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },

  // Metered TURN servers (free tier - more reliable than OpenRelay)
  // TCP on port 443 works through most firewalls (looks like HTTPS traffic)
  {
    urls: 'turn:a.relay.metered.ca:443?transport=tcp',
    username: 'e8dd65c92af533b23e42a0a8',
    credential: 'hJKrxj8FpMfLaL3D',
  },
  {
    urls: 'turns:a.relay.metered.ca:443?transport=tcp',
    username: 'e8dd65c92af533b23e42a0a8',
    credential: 'hJKrxj8FpMfLaL3D',
  },
  // UDP options (may work on less restrictive networks)
  {
    urls: 'turn:a.relay.metered.ca:80?transport=udp',
    username: 'e8dd65c92af533b23e42a0a8',
    credential: 'hJKrxj8FpMfLaL3D',
  },
  {
    urls: 'turn:a.relay.metered.ca:443?transport=udp',
    username: 'e8dd65c92af533b23e42a0a8',
    credential: 'hJKrxj8FpMfLaL3D',
  },

  // OpenRelay backup (free, less reliable)
  {
    urls: 'turn:openrelay.metered.ca:443?transport=tcp',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
];

// Force relay mode - set to true to always use TURN servers (bypasses firewall issues)
// This increases latency slightly but guarantees connection through firewalls
export const FORCE_RELAY_MODE = true;

// Connection timeout before retry (15 seconds)
export const CONNECTION_TIMEOUT_MS = 15000;

// Maximum number of connection retries
export const MAX_CONNECTION_RETRIES = 3;

// Signaling channel poll interval (250ms for fast response)
export const SIGNALING_POLL_INTERVAL = 250;

// Debug log prefix for easy filtering
export const DEBUG_PREFIX = '[VoiceCall]';
