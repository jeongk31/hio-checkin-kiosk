/**
 * Signaling Channel
 * Polling-based signaling for WebRTC negotiation
 * Used when WebSocket is not available
 */

import { SIGNALING_POLL_INTERVAL, DEBUG_PREFIX } from './constants';
import type { CallerType, SignalingMessage, SignalingMessageRecord } from './types';

export class SignalingChannel {
  private sessionId: string;
  private sender: CallerType;
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private messageHandler: ((msg: SignalingMessage) => void) | null = null;
  private lastMessageId: number = 0;
  private isSubscribed: boolean = false;

  constructor(sessionId: string, sender: CallerType) {
    this.sessionId = sessionId;
    this.sender = sender;
    console.log(`${DEBUG_PREFIX} [${sender}] SignalingChannel created for session: ${sessionId}`);
  }

  /**
   * Set the message handler for incoming messages
   */
  onMessage(handler: (msg: SignalingMessage) => void): void {
    this.messageHandler = handler;
  }

  /**
   * Start polling for messages
   */
  async subscribe(): Promise<void> {
    if (this.isSubscribed) {
      console.log(`${DEBUG_PREFIX} [${this.sender}] Already subscribed to signaling channel`);
      return;
    }

    this.isSubscribed = true;
    console.log(`${DEBUG_PREFIX} [${this.sender}] Subscribing to signaling channel, session: ${this.sessionId}, poll interval: ${SIGNALING_POLL_INTERVAL}ms`);

    // Start polling for messages, excluding our own messages
    this.pollInterval = setInterval(async () => {
      try {
        const url = `/api/signaling?sessionId=${this.sessionId}&lastId=${this.lastMessageId}&excludeSender=${this.sender}`;
        const response = await fetch(url);

        if (response.ok) {
          const data = await response.json();
          if (data.messages && Array.isArray(data.messages)) {
            for (const msg of data.messages as SignalingMessageRecord[]) {
              // Update last message ID
              this.lastMessageId = Math.max(this.lastMessageId, msg.id);

              // Log received message with details
              console.log(`${DEBUG_PREFIX} [${this.sender}] 📥 Received: type=${msg.payload?.type}, from=${msg.sender}, id=${msg.id}, session=${this.sessionId}`);
              if (msg.payload?.type === 'offer' || msg.payload?.type === 'answer') {
                console.log(`${DEBUG_PREFIX} [${this.sender}]    SDP length: ${('sdp' in msg.payload && msg.payload.sdp) ? msg.payload.sdp.length : 0} chars`);
              }
              if (msg.payload?.type === 'ice-candidate' && 'candidate' in msg.payload) {
                console.log(`${DEBUG_PREFIX} [${this.sender}]    ICE candidate: ${JSON.stringify(msg.payload.candidate).substring(0, 100)}...`);
              }

              // Call handler
              if (this.messageHandler && msg.payload) {
                this.messageHandler(msg.payload);
              }
            }
          }
        }
      } catch (error) {
        console.error(`${DEBUG_PREFIX} [${this.sender}] Poll error:`, error);
      }
    }, SIGNALING_POLL_INTERVAL);
  }

  /**
   * Send a signaling message
   */
  async send(payload: SignalingMessage): Promise<void> {
    try {
      console.log(`${DEBUG_PREFIX} [${this.sender}] 📤 Sending: type=${payload.type}, session=${this.sessionId}`);
      if (payload.type === 'offer' || payload.type === 'answer') {
        console.log(`${DEBUG_PREFIX} [${this.sender}]    SDP length: ${('sdp' in payload && payload.sdp) ? payload.sdp.length : 0} chars`);
      }
      if (payload.type === 'ice-candidate' && 'candidate' in payload) {
        console.log(`${DEBUG_PREFIX} [${this.sender}]    ICE candidate: ${JSON.stringify(payload.candidate).substring(0, 100)}...`);
      }
      if (payload.type === 'call-ended' && 'reason' in payload) {
        console.log(`${DEBUG_PREFIX} [${this.sender}]    Reason: ${payload.reason}`);
      }

      const response = await fetch('/api/signaling', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: this.sessionId,
          payload,
          sender: this.sender,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`${DEBUG_PREFIX} [${this.sender}] ❌ Send failed: ${response.status} - ${errorText}`);
        throw new Error(`Failed to send signaling message: ${response.status}`);
      }

      console.log(`${DEBUG_PREFIX} [${this.sender}] ✅ Send successful: ${payload.type}`);
    } catch (error) {
      console.error(`${DEBUG_PREFIX} [${this.sender}] ❌ Send error:`, error);
      throw error;
    }
  }

  /**
   * Clear all messages for this session (useful when starting a new call)
   */
  async clearMessages(): Promise<void> {
    try {
      console.log(`${DEBUG_PREFIX} [${this.sender}] Clearing old messages for session: ${this.sessionId}`);
      const response = await fetch('/api/signaling', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: this.sessionId }),
      });
      if (response.ok) {
        console.log(`${DEBUG_PREFIX} [${this.sender}] ✅ Cleared old messages for session: ${this.sessionId}`);
      } else {
        console.warn(`${DEBUG_PREFIX} [${this.sender}] ⚠️ Clear messages returned: ${response.status}`);
      }
    } catch (error) {
      console.error(`${DEBUG_PREFIX} [${this.sender}] ❌ Failed to clear messages:`, error);
    }
  }

  /**
   * Close the signaling channel and stop polling
   */
  close(): void {
    console.log(`${DEBUG_PREFIX} [${this.sender}] Closing SignalingChannel for session: ${this.sessionId}`);
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
      console.log(`${DEBUG_PREFIX} [${this.sender}]    Poll interval cleared`);
    }
    this.messageHandler = null;
    this.isSubscribed = false;
    console.log(`${DEBUG_PREFIX} [${this.sender}] ✅ SignalingChannel closed`);
  }

  /**
   * Check if the channel is subscribed
   */
  isActive(): boolean {
    return this.isSubscribed;
  }

  /**
   * Get the session ID
   */
  getSessionId(): string {
    return this.sessionId;
  }

  /**
   * Get the sender type
   */
  getSender(): CallerType {
    return this.sender;
  }
}
