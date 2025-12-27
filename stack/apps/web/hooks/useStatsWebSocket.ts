"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { ConsoleInfo, ServerStats } from "@/lib/api";

const MAX_HISTORY_LENGTH = 60; // Keep last 60 data points (1 minute at 1/sec)

interface StatsWithHistory {
  current: ServerStats | null;
  cpuHistory: number[];
  memoryHistory: number[];
  diskReadHistory: number[];
  diskWriteHistory: number[];
  networkRxHistory: number[]; // Rate in bytes/sec
  networkTxHistory: number[]; // Rate in bytes/sec
  networkRxRate: number; // Current rate in bytes/sec
  networkTxRate: number; // Current rate in bytes/sec
}

interface UseStatsWebSocketOptions {
  consoleInfo: ConsoleInfo | null;
  enabled?: boolean;
}

interface UseStatsWebSocketResult {
  stats: StatsWithHistory;
  isConnected: boolean;
}

export function useStatsWebSocket({
  consoleInfo,
  enabled = true,
}: UseStatsWebSocketOptions): UseStatsWebSocketResult {
  const [isConnected, setIsConnected] = useState(false);
  const [stats, setStats] = useState<StatsWithHistory>({
    current: null,
    cpuHistory: [],
    memoryHistory: [],
    diskReadHistory: [],
    diskWriteHistory: [],
    networkRxHistory: [],
    networkTxHistory: [],
    networkRxRate: 0,
    networkTxRate: 0,
  });

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Track previous network bytes to calculate rate
  const prevNetworkRef = useRef<{ rx: number; tx: number; timestamp: number } | null>(null);

  const connect = useCallback(() => {
    if (!consoleInfo || !enabled) return;

    // Build stats WebSocket URL (replace /console with /stats/ws in the path)
    const wsUrl = consoleInfo.websocketUrl.replace("/console", "/stats/ws");

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        prevNetworkRef.current = null; // Reset on new connection
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);

          if (message.type === "stats" && message.data) {
            const newStats: ServerStats = message.data;
            const now = Date.now();

            setStats((prev) => {
              const cpuPercent = newStats.cpu?.usage_percent ?? 0;
              const memoryPercent = newStats.memory?.usage_percent ?? 0;
              const diskRead = newStats.block_io?.read_bytes ?? 0;
              const diskWrite = newStats.block_io?.write_bytes ?? 0;
              const networkRxTotal = newStats.network?.rx_bytes ?? 0;
              const networkTxTotal = newStats.network?.tx_bytes ?? 0;

              // Calculate network rate (bytes per second)
              let rxRate = 0;
              let txRate = 0;

              if (prevNetworkRef.current) {
                const timeDelta = (now - prevNetworkRef.current.timestamp) / 1000; // seconds
                if (timeDelta > 0) {
                  const rxDelta = networkRxTotal - prevNetworkRef.current.rx;
                  const txDelta = networkTxTotal - prevNetworkRef.current.tx;

                  // Only calculate rate if values are increasing (not a reset)
                  if (rxDelta >= 0 && txDelta >= 0) {
                    rxRate = rxDelta / timeDelta;
                    txRate = txDelta / timeDelta;
                  }
                }
              }

              // Update previous values
              prevNetworkRef.current = { rx: networkRxTotal, tx: networkTxTotal, timestamp: now };

              return {
                current: newStats,
                cpuHistory: [...prev.cpuHistory, cpuPercent].slice(-MAX_HISTORY_LENGTH),
                memoryHistory: [...prev.memoryHistory, memoryPercent].slice(-MAX_HISTORY_LENGTH),
                diskReadHistory: [...prev.diskReadHistory, diskRead].slice(-MAX_HISTORY_LENGTH),
                diskWriteHistory: [...prev.diskWriteHistory, diskWrite].slice(-MAX_HISTORY_LENGTH),
                networkRxHistory: [...prev.networkRxHistory, rxRate].slice(-MAX_HISTORY_LENGTH),
                networkTxHistory: [...prev.networkTxHistory, txRate].slice(-MAX_HISTORY_LENGTH),
                networkRxRate: rxRate,
                networkTxRate: txRate,
              };
            });
          }
        } catch (err) {
          console.error("Failed to parse stats message:", err);
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
        wsRef.current = null;

        // Reconnect after 3 seconds if still enabled
        if (enabled) {
          reconnectTimeoutRef.current = setTimeout(connect, 3000);
        }
      };

      ws.onerror = (error) => {
        console.error("Stats WebSocket error:", error);
      };
    } catch (err) {
      console.error("Failed to create stats WebSocket:", err);
    }
  }, [consoleInfo, enabled]);

  useEffect(() => {
    if (enabled && consoleInfo) {
      connect();
    }

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect, enabled, consoleInfo]);

  // Reset stats when disabled
  useEffect(() => {
    if (!enabled) {
      setStats({
        current: null,
        cpuHistory: [],
        memoryHistory: [],
        diskReadHistory: [],
        diskWriteHistory: [],
        networkRxHistory: [],
        networkTxHistory: [],
        networkRxRate: 0,
        networkTxRate: 0,
      });
      setIsConnected(false);
      prevNetworkRef.current = null;
    }
  }, [enabled]);

  return { stats, isConnected };
}
