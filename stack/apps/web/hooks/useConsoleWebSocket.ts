"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { ConsoleInfo } from "@/lib/api";

export interface ConsoleLine {
  text: string;
  type: "stdout" | "stderr" | "command" | "info" | "error";
  timestamp: Date;
}

// Strip ANSI escape codes from text (common in Pterodactyl egg output)
function stripAnsi(text: string): string {
  // Matches ANSI escape codes including:
  // - Color codes: \x1b[31m, \x1b[0m, etc.
  // - Control codes: \x1b[2J (clear screen), \x1b[H (cursor home), etc.
  // - Extended codes: \x1b[38;2;r;g;bm (24-bit color), \x1b[38;5;nm (256 color)
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b\[[0-9;]*[A-Za-z]|\x1b\].*?\x07|\x1b\(B|\x1b\[\?.*?[hl]|\r/g, "");
}

interface UseConsoleWebSocketOptions {
  consoleInfo: ConsoleInfo | null;
  enabled?: boolean;
  maxLines?: number;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Event) => void;
}

interface UseConsoleWebSocketResult {
  lines: ConsoleLine[];
  isConnected: boolean;
  isConnecting: boolean;
  sendCommand: (command: string) => void;
  clearLines: () => void;
  reconnect: () => void;
}

export function useConsoleWebSocket({
  consoleInfo,
  enabled = true,
  maxLines = 500,
  onConnect,
  onDisconnect,
  onError,
}: UseConsoleWebSocketOptions): UseConsoleWebSocketResult {
  const [lines, setLines] = useState<ConsoleLine[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 5;

  const addLine = useCallback((line: ConsoleLine) => {
    setLines((prev) => {
      const newLines = [...prev, line];
      // Keep only the last maxLines
      if (newLines.length > maxLines) {
        return newLines.slice(-maxLines);
      }
      return newLines;
    });
  }, [maxLines]);

  const clearLines = useCallback(() => {
    setLines([]);
  }, []);

  const connect = useCallback(() => {
    if (!consoleInfo || !enabled) {
      return;
    }

    // Close existing connection
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setIsConnecting(true);

    try {
      // Append token to WebSocket URL
      const url = new URL(consoleInfo.websocketUrl);
      url.searchParams.set("token", consoleInfo.token);

      const ws = new WebSocket(url.toString());
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        setIsConnecting(false);
        reconnectAttemptsRef.current = 0;
        addLine({
          text: "Connected to console",
          type: "info",
          timestamp: new Date(),
        });
        onConnect?.();
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);

          // Handle daemon log messages: { type: "log", data: { type: "stdout", data: "...", timestamp: "..." } }
          if (message.type === "log" && message.data) {
            const logData = message.data;
            const msgType = (logData.type || logData.msg_type || "stdout").toLowerCase();
            let text = logData.data || "";

            // Strip ANSI escape codes (common in Pterodactyl eggs)
            text = stripAnsi(text);

            // Remove trailing newlines
            text = text.replace(/\r?\n$/, "");

            // Remove ISO timestamp prefix (e.g., "2025-12-27T00:27:29Z ")
            text = text.replace(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z\s*/, "");

            if (text.trim()) {
              addLine({
                text,
                type: msgType === "stderr" ? "stderr" : "stdout",
                timestamp: logData.timestamp ? new Date(logData.timestamp) : new Date(),
              });
            }
          }
          // Handle connected message
          else if (message.type === "connected") {
            // Already handled in onopen
          }
          // Handle error messages
          else if (message.type === "error") {
            addLine({
              text: message.data || message.message || "Unknown error",
              type: "error",
              timestamp: new Date(),
            });
          }
          // Fallback for other message formats
          else if (message.type === "output" || message.type === "stdout") {
            addLine({
              text: stripAnsi(message.data || message.message || ""),
              type: "stdout",
              timestamp: new Date(),
            });
          } else if (message.type === "stderr") {
            addLine({
              text: stripAnsi(message.data || message.message || ""),
              type: "stderr",
              timestamp: new Date(),
            });
          }
        } catch {
          // Plain text message
          if (event.data) {
            addLine({
              text: stripAnsi(event.data),
              type: "stdout",
              timestamp: new Date(),
            });
          }
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
        setIsConnecting(false);
        wsRef.current = null;

        addLine({
          text: "Disconnected from console",
          type: "info",
          timestamp: new Date(),
        });
        onDisconnect?.();

        // Attempt reconnection
        if (enabled && reconnectAttemptsRef.current < maxReconnectAttempts) {
          reconnectAttemptsRef.current++;
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
          reconnectTimeoutRef.current = setTimeout(() => {
            addLine({
              text: `Reconnecting... (attempt ${reconnectAttemptsRef.current}/${maxReconnectAttempts})`,
              type: "info",
              timestamp: new Date(),
            });
            connect();
          }, delay);
        }
      };

      ws.onerror = (error) => {
        setIsConnecting(false);
        addLine({
          text: "Connection error",
          type: "error",
          timestamp: new Date(),
        });
        onError?.(error);
      };
    } catch (err) {
      setIsConnecting(false);
      addLine({
        text: `Failed to connect: ${err}`,
        type: "error",
        timestamp: new Date(),
      });
    }
  }, [consoleInfo, enabled, addLine, onConnect, onDisconnect, onError]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    reconnectAttemptsRef.current = maxReconnectAttempts; // Prevent auto-reconnect
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
      addLine({
        text: "Not connected to console",
        type: "error",
        timestamp: new Date(),
      });
      return;
    }

    try {
      // Send command to daemon - can be plain text or JSON formatted
      // The daemon accepts both { type: "command", data: "..." } and plain text
      wsRef.current.send(JSON.stringify({
        type: "command",
        data: command,
      }));
    } catch (err) {
      addLine({
        text: `Failed to send command: ${err}`,
        type: "error",
        timestamp: new Date(),
      });
    }
  }, [addLine]);

  // Connect when consoleInfo becomes available
  useEffect(() => {
    if (consoleInfo && enabled) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [consoleInfo?.websocketUrl, enabled]);

  return {
    lines,
    isConnected,
    isConnecting,
    sendCommand,
    clearLines,
    reconnect,
  };
}
