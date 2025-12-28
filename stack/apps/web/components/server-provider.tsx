"use client";

import { createContext, useContext, useCallback, useMemo, useEffect, useRef } from "react";
import { useServer as useServerQuery, useServerConsole, useServerMutations } from "@/hooks/queries";
import type { Server, ConsoleInfo } from "@/lib/api";
import { playSoundEffect } from "@/hooks/useSoundEffects";
import { toast } from "sonner";

interface ServerContextType {
  server: Server | null;
  consoleInfo: ConsoleInfo | null;
  isLoading: boolean;
  isInstalling: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  refreshConsoleInfo: () => Promise<void>;

  // Actions
  start: () => Promise<void>;
  stop: () => Promise<void>;
  restart: () => Promise<void>;
  kill: () => Promise<void>;
  sendCommand: (command: string) => Promise<void>;
}

const ServerContext = createContext<ServerContextType | null>(null);

export function useServer() {
  const context = useContext(ServerContext);
  if (!context) {
    throw new Error("useServer must be used within a ServerProvider");
  }
  return context;
}

interface ServerProviderProps {
  serverId: string;
  children: React.ReactNode;
}

export function ServerProvider({ serverId, children }: ServerProviderProps) {
  // Track previous status to detect when installation completes
  const prevStatusRef = useRef<string | null>(null);

  // React Query hooks - poll faster during installation
  const {
    data: server = null,
    isLoading,
    error: serverError,
    refetch: refetchServer,
  } = useServerQuery(serverId, {
    // Poll every 2 seconds during installation, every 5 seconds otherwise
    refetchInterval: prevStatusRef.current === "INSTALLING" ? 2000 : 5000,
  });

  // Only fetch console info when server exists and is not suspended
  const {
    data: consoleInfo = null,
    refetch: refetchConsoleInfo,
  } = useServerConsole(server && !server.suspended ? serverId : undefined);

  const mutations = useServerMutations();

  // Convert React Query error to string
  const error = serverError ? "Failed to fetch server" : null;

  // Check if server is currently installing
  const isInstalling = server?.status === "INSTALLING";

  // Play sound when server finishes installing
  useEffect(() => {
    if (server?.status) {
      // If previous status was INSTALLING and new status is not INSTALLING, installation completed
      if (prevStatusRef.current === "INSTALLING" && server.status !== "INSTALLING") {
        playSoundEffect("jobDone");
        toast.success("Server installation complete!");
      }
      prevStatusRef.current = server.status;
    }
  }, [server?.status]);

  const refetch = useCallback(async () => {
    await refetchServer();
  }, [refetchServer]);

  const refreshConsoleInfo = useCallback(async () => {
    await refetchConsoleInfo();
  }, [refetchConsoleInfo]);

  const start = useCallback(async () => {
    try {
      await mutations.start.mutateAsync(serverId);
      toast.success("Server starting...");
    } catch (err) {
      toast.error("Failed to start server");
      throw err;
    }
  }, [serverId, mutations.start]);

  const stop = useCallback(async () => {
    try {
      await mutations.stop.mutateAsync(serverId);
      toast.success("Server stopping...");
    } catch (err) {
      toast.error("Failed to stop server");
      throw err;
    }
  }, [serverId, mutations.stop]);

  const restart = useCallback(async () => {
    try {
      await mutations.restart.mutateAsync(serverId);
      toast.success("Server restarting...");
    } catch (err) {
      toast.error("Failed to restart server");
      throw err;
    }
  }, [serverId, mutations.restart]);

  const kill = useCallback(async () => {
    try {
      await mutations.kill.mutateAsync(serverId);
      toast.success("Server killed");
    } catch (err) {
      toast.error("Failed to kill server");
      throw err;
    }
  }, [serverId, mutations.kill]);

  const sendCommand = useCallback(async (command: string) => {
    try {
      await mutations.sendCommand.mutateAsync({ id: serverId, command });
    } catch (err) {
      toast.error("Failed to send command");
      throw err;
    }
  }, [serverId, mutations.sendCommand]);

  const value = useMemo<ServerContextType>(() => ({
    server,
    consoleInfo,
    isLoading,
    isInstalling,
    error,
    refetch,
    refreshConsoleInfo,
    start,
    stop,
    restart,
    kill,
    sendCommand,
  }), [server, consoleInfo, isLoading, isInstalling, error, refetch, refreshConsoleInfo, start, stop, restart, kill, sendCommand]);

  return (
    <ServerContext.Provider value={value}>
      {children}
    </ServerContext.Provider>
  );
}
