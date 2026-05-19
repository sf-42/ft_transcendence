import websocket from "@fastify/websocket";
import WebSocket from "ws";
import { getFriends } from "./database";

const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://auth-service:3001';

// Heartbeat interval in milliseconds (15 seconds)
const HEARTBEAT_INTERVAL = 15000;
// Timeout for pong response (5 seconds)
const PONG_TIMEOUT = 5000;

// Helper to update last_seen in auth-service
async function updateLastSeen(userId: number): Promise<void> {
  try {
    await fetch(`${AUTH_SERVICE_URL}/connection-status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, isConnected: true })
    });
  } catch (err) {
    console.error(`[ConnectionManager] Failed to update last_seen for user ${userId}:`, err);
  }
}

export class ConnectionManager {
  private clients: Map<number, WebSocket>;
  private heartbeatIntervals: Map<number, NodeJS.Timeout>;
  private pongTimeouts: Map<number, NodeJS.Timeout>;

  constructor() {
    this.clients = new Map();
    this.heartbeatIntervals = new Map();
    this.pongTimeouts = new Map();
    console.log('Creating ConnectionManager');
  }

  add(userId: number, socket: WebSocket) {
    // If user already has a connection, close the old one
    const existingSocket = this.clients.get(userId);
    if (existingSocket && existingSocket.readyState === WebSocket.OPEN) {
      console.log(`[ConnectionManager] User ${userId} already connected, closing old connection`);
      existingSocket.send(JSON.stringify({
        type: "session_replaced",
        message: "You have been disconnected because you logged in from another location"
      }));
      existingSocket.close();
      this.clearHeartbeat(userId);
    }

    this.clients.set(userId, socket);
    console.log(`[ConnectionManager] Added user ${userId}. Total connections: ${this.clients.size}`);

    // Setup heartbeat for this connection
    this.setupHeartbeat(userId, socket);

    socket.on("close", () => this.remove(userId));
    socket.on("pong", () => this.handlePong(userId));

    // Broadcast online status to friends
    this.broadcastStatus(userId, true);
  }

  private setupHeartbeat(userId: number, socket: WebSocket) {
    const interval = setInterval(() => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.ping();
        
        // Update last_seen in auth-service to prevent stale connection cleanup
        updateLastSeen(userId);
        
        // Set timeout for pong response
        const timeout = setTimeout(() => {
          console.log(`[ConnectionManager] User ${userId} did not respond to ping, closing connection`);
          socket.terminate();
          this.remove(userId);
        }, PONG_TIMEOUT);

        this.pongTimeouts.set(userId, timeout);
      }
    }, HEARTBEAT_INTERVAL);

    this.heartbeatIntervals.set(userId, interval);
  }

  private handlePong(userId: number) {
    // Clear pong timeout when we receive pong
    const timeout = this.pongTimeouts.get(userId);
    if (timeout) {
      clearTimeout(timeout);
      this.pongTimeouts.delete(userId);
    }
  }

  private clearHeartbeat(userId: number) {
    const interval = this.heartbeatIntervals.get(userId);
    if (interval) {
      clearInterval(interval);
      this.heartbeatIntervals.delete(userId);
    }
    const timeout = this.pongTimeouts.get(userId);
    if (timeout) {
      clearTimeout(timeout);
      this.pongTimeouts.delete(userId);
    }
  }

  async remove(userId: number) {
    this.clients.delete(userId);
    this.clearHeartbeat(userId);
    console.log(`[ConnectionManager] Removed user ${userId}. Total connections: ${this.clients.size}`);

    // Update connection status in auth-service
    try {
      await fetch(`${AUTH_SERVICE_URL}/connection-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, isConnected: false })
      });
    } catch (err) {
      console.error(`[ConnectionManager] Failed to update connection status for user ${userId}:`, err);
    }

    // Broadcast offline status to friends
    this.broadcastStatus(userId, false);
  }

  /**
   * Force disconnect a user (for force login)
   */
  forceDisconnect(userId: number): boolean {
    const socket = this.clients.get(userId);
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({
        type: "force_disconnect",
        message: "You have been disconnected by a new login"
      }));
      socket.close();
      return true;
    }
    return false;
  }

  /**
   * Send message to a specific user
   */
  sendTo(userId: number, message: string) {
    const socket = this.clients.get(userId);

    if (socket && socket.readyState === WebSocket.OPEN) {
      try {
        socket.send(message);
        console.log(`[ConnectionManager] Message sent to user ${userId}`);
      } catch (err) {
        console.error(`Error sending to ${userId}:`, err);
      }
    } else {
      console.warn(`[ConnectionManager] User ${userId} not connected or socket closed`);
    }
  }

  sendNotificationTo(userId: number, notification: any) {
    const socket = this.clients.get(userId);
    if (socket && socket.readyState === WebSocket.OPEN) {
      try {
        socket.send(JSON.stringify(notification));
        console.log(`[ConnectionManager] Notification sent to user ${userId}`);
      } catch (err) {
        console.error(`Error sending notification to ${userId}:`, err);
      }
    } else {
      console.warn(`[ConnectionManager] User ${userId} not connected or socket closed`);
    }
  }

  /**
   * Check if user is connected
   */
  isConnected(userId: number): boolean {
    const socket = this.clients.get(userId);
    return socket !== undefined && socket.readyState === WebSocket.OPEN;
  }

  /**
   * Get all connected users
   */
  getConnectedUsers(): number[] {
    return Array.from(this.clients.keys());
  }
  /**
   * Broadcast online/offline status to user's friends
   */
  async broadcastStatus(userId: number, isOnline: boolean) {
    try {
      const friendIds = await getFriends(userId);
      const message = JSON.stringify({
        type: 'friend_status',
        userId: userId,
        isOnline: isOnline
      });

      friendIds.forEach(friendId => {
        if (this.isConnected(friendId)) {
          this.sendTo(friendId, message);
        }
      });
      console.log(`[ConnectionManager] Broadcasted status for user ${userId} to ${friendIds.length} friends`);
    } catch (err) {
      console.error(`[ConnectionManager] Failed to broadcast status for user ${userId}:`, err);
    }
  }
}
