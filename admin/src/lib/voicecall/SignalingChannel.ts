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
    console.log(`${DEBUG_PREFIX} SignalingChannel created for session: ${sessionId}, sender: ${sender}`);
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
      console.log(`${DEBUG_PREFIX} Already subscribed to signaling channel`);
      return;
    }

    this.isSubscribed = true;
    console.log(`${DEBUG_PREFIX} Subscribing to signaling channel...`);

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

              // Log received message
              console.log(`${DEBUG_PREFIX} 📥 Received:`, msg.payload?.type);

              // Call handler
              if (this.messageHandler && msg.payload) {
                this.messageHandler(msg.payload);
              }
            }
          }
        }
      } catch (error) {
        console.error(`${DEBUG_PREFIX} Poll error:`, error);
      }
    }, SIGNALING_POLL_INTERVAL);
  }

  /**
   * Send a signaling message
   */
  async send(payload: SignalingMessage): Promise<void> {
    try {
      console.log(`${DEBUG_PREFIX} 📤 Sending:`, payload.type);

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
        throw new Error(`Failed to send signaling message: ${response.status}`);
      }
    } catch (error) {
      console.error(`${DEBUG_PREFIX} Send error:`, error);
      throw error;
    }
  }

  /**
   * Clear all messages for this session (useful when starting a new call)
   */
  async clearMessages(): Promise<void> {
    try {
      await fetch('/api/signaling', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: this.sessionId }),
      });
      console.log(`${DEBUG_PREFIX} Cleared old messages for session:`, this.sessionId);
    } catch (error) {
      console.error(`${DEBUG_PREFIX} Failed to clear messages:`, error);
    }
  }

  /**
   * Close the signaling channel and stop polling
   */
  close(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    this.messageHandler = null;
    this.isSubscribed = false;
    console.log(`${DEBUG_PREFIX} SignalingChannel closed`);
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
