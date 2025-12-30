import { WebSocket } from "ws";
import type { WSEventType, WSEvent, ConnectedClient } from "./ws.types";
import { db } from "./db";

// Re-export types for backwards compatibility
export type { WSEventType, WSEvent, ConnectedClient } from "./ws.types";

// Interval for periodic updates (5 seconds)
const UPDATE_INTERVAL_MS = 5000;

class WebSocketManager {
  private clients: Map<WebSocket, ConnectedClient> = new Map();
  private updateInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // Start periodic updates
    this.startPeriodicUpdates();
  }

  /**
   * Start the periodic update interval
   */
  private startPeriodicUpdates() {
    if (this.updateInterval) return;

    this.updateInterval = setInterval(() => {
      this.sendPeriodicUpdates();
    }, UPDATE_INTERVAL_MS);

    // Don't block process exit
    if (this.updateInterval.unref) {
      this.updateInterval.unref();
    }
  }

  /**
   * Stop the periodic update interval
   */
  stopPeriodicUpdates() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }

  /**
   * Send periodic updates to all subscribed clients
   */
  private async sendPeriodicUpdates() {
    // Debug: Log client state
    const clientCount = this.clients.size;
    const authenticatedCount = Array.from(this.clients.values()).filter(
      (c) => c.authenticated
    ).length;
    const subscribedCount = Array.from(this.clients.values()).filter(
      (c) => c.subscribedServers.size > 0
    ).length;

    if (clientCount > 0) {
      console.log(
        `[WS Periodic] Clients: ${clientCount}, Authenticated: ${authenticatedCount}, Subscribed: ${subscribedCount}`
      );
    }

    // Collect all unique server IDs that clients are subscribed to
    const subscribedServerIds = new Set<string>();
    for (const [, client] of this.clients) {
      if (client.authenticated) {
        for (const serverId of client.subscribedServers) {
          subscribedServerIds.add(serverId);
        }
      }
    }

    if (subscribedServerIds.size === 0) return;

    console.log(`[WS Periodic] Sending updates for ${subscribedServerIds.size} servers`);

    try {
      // Fetch all subscribed servers in one query
      const servers = await db.server.findMany({
        where: {
          id: { in: Array.from(subscribedServerIds) },
        },
        include: {
          node: {
            include: {
              location: true,
            },
          },
          allocations: true,
          blueprint: {
            select: {
              id: true,
              name: true,
              imageName: true,
              imageTag: true,
            },
          },
        },
      });

      // Create a map for quick lookup
      const serverMap = new Map(servers.map((s) => [s.id, s]));

      // Send updates to each client
      for (const [ws, client] of this.clients) {
        if (!client.authenticated || client.subscribedServers.size === 0) continue;
        if (ws.readyState !== WebSocket.OPEN) continue;

        // Send update for each subscribed server
        for (const serverId of client.subscribedServers) {
          const server = serverMap.get(serverId);
          if (server) {
            const message = JSON.stringify({
              type: "server:sync",
              serverId,
              data: this.serializeServer(server),
            });
            ws.send(message);
          }
        }
      }
    } catch (error) {
      // Log error but don't crash - periodic updates are best-effort
      console.error("Error sending periodic WebSocket updates:", error);
    }
  }

  /**
   * Serialize server for WebSocket transmission
   */
  private serializeServer(server: any) {
    return {
      id: server.id,
      shortId: server.shortId,
      name: server.name,
      description: server.description,
      status: server.status,
      suspended: server.suspended,
      containerId: server.containerId,
      memory: Number(server.memory),
      disk: Number(server.disk),
      cpu: server.cpu,
      cpuPinning: server.cpuPinning,
      swap: Number(server.swap),
      oomKillDisable: server.oomKillDisable,
      backupLimit: server.backupLimit,
      nodeId: server.nodeId,
      blueprintId: server.blueprintId,
      ownerId: server.ownerId,
      createdAt: server.createdAt,
      updatedAt: server.updatedAt,
      node: server.node
        ? {
            id: server.node.id,
            shortId: server.node.shortId,
            displayName: server.node.displayName,
            fqdn: server.node.fqdn,
            daemonPort: server.node.daemonPort,
            location: server.node.location,
          }
        : null,
      allocations:
        server.allocations?.map((a: any) => ({
          id: a.id,
          ip: a.ip,
          port: a.port,
          isPrimary: a.isPrimary,
        })) || [],
      blueprint: server.blueprint
        ? {
            id: server.blueprint.id,
            name: server.blueprint.name,
          }
        : null,
    };
  }

  addClient(ws: WebSocket, userId?: string) {
    this.clients.set(ws, {
      ws,
      userId,
      authenticated: !!userId,
      subscribedServers: new Set(),
    });
  }

  /**
   * Authenticate a connected client
   */
  authenticateClient(ws: WebSocket, userId: string) {
    const client = this.clients.get(ws);
    if (client) {
      client.userId = userId;
      client.authenticated = true;
    }
  }

  /**
   * Check if a client is authenticated
   */
  isAuthenticated(ws: WebSocket): boolean {
    const client = this.clients.get(ws);
    return client?.authenticated ?? false;
  }

  removeClient(ws: WebSocket) {
    this.clients.delete(ws);
  }

  // Subscribe client to server updates (requires authentication)
  subscribeToServer(ws: WebSocket, serverId: string): boolean {
    const client = this.clients.get(ws);
    if (!client) return false;

    // Only authenticated clients can subscribe to server updates
    if (!client.authenticated) {
      return false;
    }

    client.subscribedServers.add(serverId);
    return true;
  }

  // Unsubscribe client from server updates
  unsubscribeFromServer(ws: WebSocket, serverId: string) {
    const client = this.clients.get(ws);
    if (client) {
      client.subscribedServers.delete(serverId);
    }
  }

  // Broadcast event to all connected clients
  broadcast(event: WSEvent) {
    const message = JSON.stringify(event);

    for (const [, client] of this.clients) {
      // If event is scoped to a user, only send to that user
      if (event.userId && client.userId !== event.userId) {
        continue;
      }

      // If event is scoped to a server, only send to subscribed clients
      if (event.serverId && !client.subscribedServers.has(event.serverId)) {
        continue;
      }

      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(message);
      }
    }
  }

  // Broadcast to a specific user
  broadcastToUser(userId: string, event: WSEvent) {
    this.broadcast({ ...event, userId });
  }

  // Broadcast to clients subscribed to a server
  broadcastToServer(serverId: string, event: WSEvent) {
    this.broadcast({ ...event, serverId });
  }

  // Handle incoming messages from clients
  handleMessage(ws: WebSocket, message: string) {
    try {
      const data = JSON.parse(message);

      switch (data.type) {
        case "subscribe":
          if (data.serverId) {
            const success = this.subscribeToServer(ws, data.serverId);
            if (ws.readyState === WebSocket.OPEN) {
              if (success) {
                ws.send(JSON.stringify({ type: "subscribed", serverId: data.serverId }));
              } else {
                ws.send(
                  JSON.stringify({ type: "error", error: "Authentication required to subscribe" })
                );
              }
            }
          }
          break;
        case "unsubscribe":
          if (data.serverId) {
            this.unsubscribeFromServer(ws, data.serverId);
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: "unsubscribed", serverId: data.serverId }));
            }
          }
          break;
        case "ping":
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "pong" }));
          }
          break;
      }
    } catch {
      // Invalid JSON message, ignore
    }
  }

  getClientCount(): number {
    return this.clients.size;
  }
}

// Singleton instance
export const wsManager = new WebSocketManager();

// Helper to emit server events
export const emitServerEvent = (
  type: WSEventType,
  serverId: string,
  data: unknown,
  userId?: string
) => {
  wsManager.broadcast({
    type,
    serverId,
    data,
    userId,
  });
};

// Helper to emit global events
export const emitGlobalEvent = (type: WSEventType, data: unknown) => {
  wsManager.broadcast({ type, data });
};
