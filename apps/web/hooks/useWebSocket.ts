import { useEffect, useRef, useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { serverKeys } from "@/hooks/queries";
import { getApiEndpoint } from "@/lib/api-url";

const getWebSocketUrl = (): string => {
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  return `${protocol}://${window.location.host}/api/ws`;
};

// Fetch WebSocket auth token from API
const fetchWsToken = async (): Promise<{ token: string; userId: string } | null> => {
  try {
    const response = await fetch(getApiEndpoint("/ws/token"), {
      credentials: "include",
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
};

export type WSEventType =
  | "server:created"
  | "server:updated"
  | "server:deleted"
  | "server:status"
  | "server:stats"
  | "server:sync" // Periodic full server data sync (every 5s)
  | "node:updated"
  | "node:status"
  | "backup:created"
  | "backup:deleted"
  | "backup:status"
  | "auth_success" // Authentication successful
  | "auth_error" // Authentication failed
  | "subscribed" // Successfully subscribed to server
  | "unsubscribed" // Successfully unsubscribed from server
  | "pong";

interface WSEvent {
  type: WSEventType;
  data: unknown;
  serverId?: string;
  userId?: string;
}

interface UseWebSocketOptions {
  // Server IDs to subscribe to for targeted updates
  serverIds?: string[];
  // Whether to automatically reconnect on disconnect
  autoReconnect?: boolean;
  // Reconnection delay in ms
  reconnectDelay?: number;
  // Enable/disable the WebSocket connection
  enabled?: boolean;
}

export const useWebSocket = (options: UseWebSocketOptions = {}) => {
  const { serverIds = [], autoReconnect = true, reconnectDelay = 3000, enabled = true } = options;

  const queryClient = useQueryClient();
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingSubscriptionsRef = useRef<string[]>([]);
  const subscribedServersRef = useRef<Set<string>>(new Set());
  const isAuthenticatedRef = useRef(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [lastMessage, setLastMessage] = useState<WSEvent | null>(null);

  // Handle incoming WebSocket messages
  const handleMessage = useCallback(
    (event: MessageEvent) => {
      try {
        const data: WSEvent = JSON.parse(event.data);
        setLastMessage(data);

        switch (data.type) {
          case "server:created":
            // Invalidate server list
            queryClient.invalidateQueries({ queryKey: serverKeys.list() });
            break;

          case "server:updated":
            // Update specific server in cache
            if (data.serverId) {
              queryClient.invalidateQueries({
                queryKey: serverKeys.detail(data.serverId),
              });
            }
            // Also invalidate list for status updates
            queryClient.invalidateQueries({ queryKey: serverKeys.list() });
            break;

          case "server:deleted":
            // Remove from cache and invalidate list
            if (data.data && typeof data.data === "object" && "id" in data.data) {
              const deletedId = (data.data as { id: string }).id;
              queryClient.removeQueries({
                queryKey: serverKeys.detail(deletedId),
              });
            }
            queryClient.invalidateQueries({ queryKey: serverKeys.list() });
            break;

          case "server:status":
            // Update server status in cache - force immediate refetch
            if (data.serverId) {
              // Immediately update the cache if we have status data
              if (data.data && typeof data.data === "object" && "status" in (data.data as object)) {
                const statusData = data.data as { status: string };
                queryClient.setQueryData(serverKeys.detail(data.serverId), (oldData: unknown) => {
                  if (oldData && typeof oldData === "object") {
                    return { ...(oldData as Record<string, unknown>), status: statusData.status };
                  }
                  return oldData;
                });
              }
              // Also trigger refetch to get full updated data
              queryClient.invalidateQueries({
                queryKey: serverKeys.detail(data.serverId),
              });
            }
            queryClient.invalidateQueries({ queryKey: serverKeys.list() });
            break;

          case "server:stats":
            // Stats updates can be handled by specific components
            break;

          case "server:sync":
            // Periodic sync - update cache directly without refetching
            if (data.serverId && data.data && typeof data.data === "object") {
              const serverData = data.data as Record<string, unknown>;
              const queryKey = serverKeys.detail(data.serverId);

              // Update the server detail cache directly with proper merge
              queryClient.setQueryData(queryKey, (oldData: unknown) => {
                // Merge new data with existing data to preserve any extra fields
                if (oldData && typeof oldData === "object") {
                  const merged = { ...(oldData as Record<string, unknown>), ...serverData };
                  return merged;
                }
                return serverData;
              });

              // Force React Query to notify subscribers by invalidating stale time
              // This ensures components re-render when data changes
              queryClient.invalidateQueries({
                queryKey,
                refetchType: "none", // Don't refetch, just mark as stale to trigger re-render
              });

              // Also update the server in the list cache
              queryClient.setQueryData(serverKeys.list(), (oldList: unknown[] | undefined) => {
                if (!oldList || !Array.isArray(oldList)) return oldList;
                return oldList.map((item) => {
                  const server = item as Record<string, unknown>;
                  return server.id === data.serverId ? { ...server, ...serverData } : server;
                });
              });
            }
            break;

          case "node:updated":
          case "node:status":
            // Invalidate nodes queries
            queryClient.invalidateQueries({ queryKey: ["nodes"] });
            break;

          case "backup:created":
          case "backup:deleted":
          case "backup:status":
            // Invalidate backup queries for the server
            if (data.serverId) {
              queryClient.invalidateQueries({
                queryKey: ["backups", data.serverId],
              });
            }
            break;

          case "auth_success":
            // Authentication successful - subscribe to pending servers
            setIsAuthenticated(true);
            isAuthenticatedRef.current = true;
            console.log("WebSocket: Authentication successful");
            if (pendingSubscriptionsRef.current.length > 0) {
              const toSubscribe = pendingSubscriptionsRef.current.filter(
                (id) => !subscribedServersRef.current.has(id)
              );
              if (toSubscribe.length > 0) {
                console.log(`WebSocket: Subscribing to ${toSubscribe.length} pending servers`);
                toSubscribe.forEach((serverId) => {
                  wsRef.current?.send(JSON.stringify({ type: "subscribe", serverId }));
                  subscribedServersRef.current.add(serverId);
                });
              }
              pendingSubscriptionsRef.current = [];
            }
            break;

          case "auth_error":
            // Authentication failed
            setIsAuthenticated(false);
            isAuthenticatedRef.current = false;
            console.warn("WebSocket authentication failed");
            break;

          case "subscribed":
          case "unsubscribed":
            // Subscription confirmations - no action needed
            break;

          case "pong":
            // Heartbeat response, connection is alive
            break;
        }
      } catch (error) {
        console.error("Failed to parse WebSocket message:", error);
      }
    },
    [queryClient]
  );

  // Connect to WebSocket
  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    try {
      const ws = new WebSocket(getWebSocketUrl());

      ws.onopen = async () => {
        console.log("WebSocket connected");
        setIsConnected(true);
        setIsAuthenticated(false);

        // Store serverIds as pending - will subscribe after auth_success
        pendingSubscriptionsRef.current = [...serverIds];

        // Cookie auth happens automatically on server side, but in case it fails
        // (cross-origin issues), we'll send the token manually after a short delay
        setTimeout(async () => {
          // Check if we're already authenticated (cookie worked)
          if (wsRef.current?.readyState === WebSocket.OPEN && !isAuthenticatedRef.current) {
            console.log("WebSocket: Cookie auth may have failed, trying token auth...");
            const tokenData = await fetchWsToken();
            if (
              tokenData &&
              wsRef.current?.readyState === WebSocket.OPEN &&
              !isAuthenticatedRef.current
            ) {
              console.log("WebSocket: Sending auth token...");
              wsRef.current.send(JSON.stringify({ type: "auth", token: tokenData.token }));
            }
          }
        }, 500); // Wait 500ms to see if cookie auth succeeds first
      };

      ws.onmessage = handleMessage;

      ws.onclose = () => {
        console.log("WebSocket disconnected");
        setIsConnected(false);
        setIsAuthenticated(false);
        isAuthenticatedRef.current = false;
        wsRef.current = null;
        // Clear subscriptions on disconnect - they'll be re-established on reconnect
        subscribedServersRef.current.clear();

        // Auto-reconnect
        if (autoReconnect && enabled) {
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, reconnectDelay);
        }
      };

      ws.onerror = (error) => {
        console.error("WebSocket error:", error);
      };

      wsRef.current = ws;
    } catch (error) {
      console.error("Failed to connect WebSocket:", error);
    }
  }, [serverIds, autoReconnect, reconnectDelay, enabled, handleMessage]);

  // Disconnect from WebSocket
  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setIsConnected(false);
  }, []);

  // Subscribe to a server
  const subscribe = useCallback(
    (serverId: string) => {
      // Skip if already subscribed
      if (subscribedServersRef.current.has(serverId)) {
        return;
      }

      if (wsRef.current?.readyState === WebSocket.OPEN && isAuthenticatedRef.current) {
        wsRef.current.send(JSON.stringify({ type: "subscribe", serverId }));
        subscribedServersRef.current.add(serverId);
      } else {
        // Add to pending subscriptions
        if (!pendingSubscriptionsRef.current.includes(serverId)) {
          pendingSubscriptionsRef.current.push(serverId);
        }
      }
    },
    [] // No dependencies - use refs instead
  );

  // Unsubscribe from a server
  const unsubscribe = useCallback((serverId: string) => {
    subscribedServersRef.current.delete(serverId);
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "unsubscribe", serverId }));
    }
  }, []);

  // Send ping to keep connection alive
  const ping = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "ping" }));
    }
  }, []);

  // Connect on mount, disconnect on unmount
  useEffect(() => {
    if (enabled) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [enabled]); // Only re-run if enabled changes

  // Update subscriptions when serverIds change
  useEffect(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN && isAuthenticatedRef.current) {
      // Subscribe to new servers (subscribe function handles duplicates)
      serverIds.forEach((serverId) => {
        subscribe(serverId);
      });
    } else if (serverIds.length > 0) {
      // If not connected/authenticated yet, add to pending
      serverIds.forEach((serverId) => {
        if (
          !pendingSubscriptionsRef.current.includes(serverId) &&
          !subscribedServersRef.current.has(serverId)
        ) {
          pendingSubscriptionsRef.current.push(serverId);
        }
      });
    }
  }, [serverIds, subscribe]);

  // Ping every 30 seconds to keep connection alive
  useEffect(() => {
    if (!isConnected) return;

    const interval = setInterval(() => {
      ping();
    }, 30000);

    return () => clearInterval(interval);
  }, [isConnected, ping]);

  return {
    isConnected,
    isAuthenticated,
    lastMessage,
    subscribe,
    unsubscribe,
    connect,
    disconnect,
    ping,
  };
};

// Hook for subscribing to a single server's updates
export const useServerWebSocket = (serverId: string | undefined) => {
  return useWebSocket({
    serverIds: serverId ? [serverId] : [],
    enabled: !!serverId,
  });
};

// Global WebSocket hook for the app
export const useGlobalWebSocket = () => {
  return useWebSocket({
    enabled: true,
  });
};
