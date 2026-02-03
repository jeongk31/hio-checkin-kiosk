/**
 * Voice Call Constants
 * Shared configuration for WebRTC voice calls between admin and kiosk
 */

// Build ICE servers list from environment variables
function buildIceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [
    // Google STUN servers (always included, free)
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ];

  // Add TURN server if configured (optional, improves reliability)
  const turnUrl = process.env.NEXT_PUBLIC_TURN_SERVER_URL;
  const turnUsername = process.env.NEXT_PUBLIC_TURN_SERVER_USERNAME;
  const turnCredential = process.env.NEXT_PUBLIC_TURN_SERVER_CREDENTIAL;

  if (turnUrl && turnUsername && turnCredential) {
    console.log('[VoiceCall] TURN server configured:', turnUrl);
    servers.push({
      urls: turnUrl,
      username: turnUsername,
      credential: turnCredential,
    });
  } else {
    console.log('[VoiceCall] No TURN server configured, using STUN only (80-90% success rate)');
  }

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
