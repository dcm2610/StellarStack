"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { ConsoleInfo, ServerStats } from "@/lib/api";

// Strip ANSI escape codes from text
function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b\[[0-9;]*[A-Za-z]|\x1b\].*?\x07|\x1b\(B|\x1b\[\?.*?[hl]|\r/g, "");
}

const MAX_HISTORY_LENGTH = 60;
const MAX_CONSOLE_LINES = 500;

export interface ConsoleLine {
  text: string;
  type: "stdout" | "stderr" | "command" | "info" | "error";
  timestamp: Date;
}

export interface StatsWithHistory {
  current: ServerStats | null;
  cpuHistory: number[];
  memoryHistory: number[];
  memoryPercentHistory: number[];
  networkRxHistory: number[];
  networkTxHistory: number[];
  networkRxRate: number;
  networkTxRate: number;
  diskHistory: number[];
  diskPercentHistory: number[];
}

interface UseServerWebSocketOptions {
  consoleInfo: ConsoleInfo | null;
  enabled?: boolean;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onStatusChange?: (state: string) => void;
}

interface UseServerWebSocketResult {
  // Console
  lines: ConsoleLine[];
  clearLines: () => void;
  sendCommand: (command: string) => void;
  sendPowerAction: (action: "start" | "stop" | "restart" | "kill") => void;

  // Stats
  stats: StatsWithHistory;

  // Connection state
  isConnected: boolean;
  isConnecting: boolean;
  reconnect: () => void;
}

/**
 * Combined WebSocket hook for console and stats from the Rust daemon.
 * Uses a single WebSocket connection for both console output and statistics.
 */
export function useServerWebSocket({
  consoleInfo,
  enabled = true,
  onConnect,
  onDisconnect,
  onStatusChange,
}: UseServerWebSocketOptions): UseServerWebSocketResult {
  const [lines, setLines] = useState<ConsoleLine[]>([]);
  const [stats, setStats] = useState<StatsWithHistory>({
    current: null,
    cpuHistory: [],
    memoryHistory: [],
    memoryPercentHistory: [],
    networkRxHistory: [],
    networkTxHistory: [],
    networkRxRate: 0,
    networkTxRate: 0,
    diskHistory: [],
    diskPercentHistory: [],
  });
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const prevNetworkRef = useRef<{ rx: number; tx: number; timestamp: number } | null>(null);
  const connectingRef = useRef(false);
  const lastConnectionUrlRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  const maxReconnectAttempts = 5;

  const addLine = useCallback((line: ConsoleLine) => {
    setLines((prev) => {
      const newLines = [...prev, line];
      if (newLines.length > MAX_CONSOLE_LINES) {
        return newLines.slice(-MAX_CONSOLE_LINES);
      }
      return newLines;
    });
  }, []);

  const clearLines = useCallback(() => {
    setLines([]);
  }, []);

  const connect = useCallback(() => {
    if (!consoleInfo || !enabled || !mountedRef.current) return;

    // Build URL to compare
    const url = new URL(consoleInfo.websocketUrl);
    url.searchParams.set("token", consoleInfo.token);
    const urlString = url.toString();

    // Prevent duplicate connections to the same URL
    if (connectingRef.current && lastConnectionUrlRef.current === urlString) {
      console.log("[WebSocket] Already connecting to same URL, skipping");
      return;
    }

    // If already connected to the same URL, skip
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && lastConnectionUrlRef.current === urlString) {
      console.log("[WebSocket] Already connected to same URL, skipping");
      return;
    }

    // Close existing connection if different URL or not connected
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    connectingRef.current = true;
    lastConnectionUrlRef.current = urlString;
    setIsConnecting(true);

    try {
      const ws = new WebSocket(urlString);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!mountedRef.current) {
          ws.close();
          return;
        }
        connectingRef.current = false;
        setIsConnecting(false);
        reconnectAttemptsRef.current = 0;
        prevNetworkRef.current = null;
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);

          if (message.event && Array.isArray(message.args)) {
            const eventType = message.event;
            const data = message.args[0] || {};

            switch (eventType) {
              case "auth success":
                setIsConnected(true);
                onConnect?.();
                // Request recent logs on connection
                ws.send(JSON.stringify({ event: "send logs", args: [] }));
                break;

              case "console history":
                // Handle bulk log history (array of lines)
                if (Array.isArray(data.lines)) {
                  const historyLines: ConsoleLine[] = data.lines
                    .map((line: string) => {
                      const text = stripAnsi(line).replace(/\r?\n$/, "");
                      return text.trim() ? { text, type: "stdout" as const, timestamp: new Date() } : null;
                    })
                    .filter((line: ConsoleLine | null): line is ConsoleLine => line !== null);

                  if (historyLines.length > 0) {
                    setLines((prev) => {
                      // Prepend history, keeping total under max
                      const combined = [...historyLines, ...prev];
                      return combined.slice(-MAX_CONSOLE_LINES);
                    });
                  }
                }
                break;

              case "jwt error":
                addLine({ text: `Authentication error: ${data.message || "Invalid token"}`, type: "error", timestamp: new Date() });
                break;

              case "error":
                addLine({ text: data.message || "Unknown error", type: "error", timestamp: new Date() });
                break;

              case "status":
                if (data.state) {
                  onStatusChange?.(data.state);
                  // Clear console only when server is fully offline
                  if (data.state === "offline") {
                    setLines([]);
                  }
                }
                break;

              case "console output":
                if (data.line) {
                  let text = stripAnsi(data.line).replace(/\r?\n$/, "");
                  if (text.trim()) {
                    addLine({ text, type: "stdout", timestamp: new Date() });
                  }
                }
                break;

              case "install output":
                if (data.line) {
                  let text = stripAnsi(data.line).replace(/\r?\n$/, "");
                  if (text.trim()) {
                    addLine({ text: `[install] ${text}`, type: "stdout", timestamp: new Date() });
                  }
                }
                break;

              case "install started":
                addLine({ text: "Installation started...", type: "info", timestamp: new Date() });
                break;

              case "install completed":
                addLine({
                  text: data.successful ? "Installation completed successfully" : "Installation failed",
                  type: data.successful ? "info" : "error",
                  timestamp: new Date(),
                });
                break;

              case "stats": {
                const now = Date.now();
                const newStats: ServerStats = {
                  memory_bytes: data.memory_bytes ?? 0,
                  memory_limit_bytes: data.memory_limit_bytes ?? 0,
                  cpu_absolute: data.cpu_absolute ?? 0,
                  network: {
                    rx_bytes: data.network?.rx_bytes ?? 0,
                    tx_bytes: data.network?.tx_bytes ?? 0,
                  },
                  uptime: data.uptime ?? 0,
                  state: data.state ?? "unknown",
                  disk_bytes: data.disk_bytes ?? 0,
                  disk_limit_bytes: data.disk_limit_bytes ?? 0,
                };

                setStats((prev) => {
                  const cpuPercent = newStats.cpu_absolute;
                  const memoryBytes = newStats.memory_bytes;
                  const memoryLimitBytes = newStats.memory_limit_bytes;
                  const memoryPercent = memoryLimitBytes > 0 ? (memoryBytes / memoryLimitBytes) * 100 : 0;

                  const networkRxTotal = newStats.network.rx_bytes;
                  const networkTxTotal = newStats.network.tx_bytes;

                  // Disk usage
                  const diskBytes = newStats.disk_bytes;
                  const diskLimitBytes = newStats.disk_limit_bytes;
                  const diskPercent = diskLimitBytes > 0 ? (diskBytes / diskLimitBytes) * 100 : 0;

                  let rxRate = 0;
                  let txRate = 0;

                  if (prevNetworkRef.current) {
                    const timeDelta = (now - prevNetworkRef.current.timestamp) / 1000;
                    if (timeDelta > 0) {
                      const rxDelta = networkRxTotal - prevNetworkRef.current.rx;
                      const txDelta = networkTxTotal - prevNetworkRef.current.tx;
                      if (rxDelta >= 0 && txDelta >= 0) {
                        rxRate = rxDelta / timeDelta;
                        txRate = txDelta / timeDelta;
                      }
                    }
                  }

                  prevNetworkRef.current = { rx: networkRxTotal, tx: networkTxTotal, timestamp: now };

                  return {
                    current: newStats,
                    cpuHistory: [...prev.cpuHistory, cpuPercent].slice(-MAX_HISTORY_LENGTH),
                    memoryHistory: [...prev.memoryHistory, memoryBytes].slice(-MAX_HISTORY_LENGTH),
                    memoryPercentHistory: [...prev.memoryPercentHistory, memoryPercent].slice(-MAX_HISTORY_LENGTH),
                    networkRxHistory: [...prev.networkRxHistory, rxRate].slice(-MAX_HISTORY_LENGTH),
                    networkTxHistory: [...prev.networkTxHistory, txRate].slice(-MAX_HISTORY_LENGTH),
                    networkRxRate: rxRate,
                    networkTxRate: txRate,
                    diskHistory: [...prev.diskHistory, diskBytes].slice(-MAX_HISTORY_LENGTH),
                    diskPercentHistory: [...prev.diskPercentHistory, diskPercent].slice(-MAX_HISTORY_LENGTH),
                  };
                });
                break;
              }

              default:
                break;
            }
          }
        } catch {
          if (event.data) {
            addLine({ text: stripAnsi(event.data), type: "stdout", timestamp: new Date() });
          }
        }
      };

      ws.onclose = () => {
        connectingRef.current = false;
        wsRef.current = null;

        // Only update state if component is still mounted
        if (!mountedRef.current) return;

        setIsConnected(false);
        setIsConnecting(false);
        onDisconnect?.();

        // Attempt reconnection only if still mounted and enabled
        if (mountedRef.current && enabled && reconnectAttemptsRef.current < maxReconnectAttempts) {
          reconnectAttemptsRef.current++;
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
          reconnectTimeoutRef.current = setTimeout(() => {
            if (mountedRef.current) {
              connect();
            }
          }, delay);
        }
      };

      ws.onerror = () => {
        connectingRef.current = false;
        if (mountedRef.current) {
          setIsConnecting(false);
        }
      };
    } catch (err) {
      connectingRef.current = false;
      if (mountedRef.current) {
        setIsConnecting(false);
      }
      console.error("WebSocket connection failed:", err);
    }
  }, [consoleInfo, enabled, addLine, onConnect, onDisconnect, onStatusChange]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    reconnectAttemptsRef.current = maxReconnectAttempts;
    connectingRef.current = false;
    lastConnectionUrlRef.current = null;
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsConnected(false);
    setIsConnecting(false);
  }, []);

  const reconnect = useCallback(() => {
    reconnectAttemptsRef.current = 0;
    disconnect();
    connect();
  }, [connect, disconnect]);

  const sendCommand = useCallback((command: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      return;
    }

    try {
      wsRef.current.send(JSON.stringify({ event: "send command", args: [command] }));
    } catch (err) {
      console.error("Failed to send command:", err);
    }
  }, []);

  const sendPowerAction = useCallback((action: "start" | "stop" | "restart" | "kill") => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      return;
    }

    try {
      wsRef.current.send(JSON.stringify({ event: "set state", args: [action] }));
    } catch (err) {
      console.error("Failed to send power action:", err);
    }
  }, []);

  // Connect when consoleInfo becomes available
  useEffect(() => {
    mountedRef.current = true;

    if (consoleInfo && enabled) {
      connect();
    }

    return () => {
      // Mark as unmounted first to prevent any state updates
      mountedRef.current = false;

      // Clear any pending reconnect timers
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }

      // Close the WebSocket connection
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }

      // Reset connection state
      connectingRef.current = false;
      lastConnectionUrlRef.current = null;
      reconnectAttemptsRef.current = maxReconnectAttempts; // Prevent reconnection attempts
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- connect is stable via refs, we only want to reconnect on URL/token/enabled changes
  }, [consoleInfo?.websocketUrl, consoleInfo?.token, enabled]);

  // Reset state when disabled
  useEffect(() => {
    if (!enabled) {
      setStats({
        current: null,
        cpuHistory: [],
        memoryHistory: [],
        memoryPercentHistory: [],
        networkRxHistory: [],
        networkTxHistory: [],
        networkRxRate: 0,
        networkTxRate: 0,
        diskHistory: [],
        diskPercentHistory: [],
      });
      prevNetworkRef.current = null;
    }
  }, [enabled]);

  return {
    lines,
    clearLines,
    sendCommand,
    sendPowerAction,
    stats,
    isConnected,
    isConnecting,
    reconnect,
  };
}
