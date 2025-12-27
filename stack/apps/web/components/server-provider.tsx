"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { servers as serversApi } from "@/lib/api";
import type { Server, ConsoleInfo } from "@/lib/api";
import { toast } from "sonner";

interface ServerContextType {
  server: Server | null;
  consoleInfo: ConsoleInfo | null;
  isLoading: boolean;
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
  const [server, setServer] = useState<Server | null>(null);
  const [consoleInfo, setConsoleInfo] = useState<ConsoleInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchServer = useCallback(async () => {
    try {
      const data = await serversApi.get(serverId);
      setServer(data);
      setError(null);
    } catch (err) {
      setError("Failed to fetch server");
      console.error("Failed to fetch server:", err);
    } finally {
      setIsLoading(false);
    }
  }, [serverId]);


  const fetchConsoleInfo = useCallback(async () => {
    if (!server || !server.containerId) {
      setConsoleInfo(null);
      return;
    }

    try {
      const data = await serversApi.console(serverId);
      setConsoleInfo(data);
    } catch (err) {
      // Console info may fail if container isn't ready
      console.error("Failed to fetch console info:", err);
      setConsoleInfo(null);
    }
  }, [serverId, server?.containerId]);

  // Initial fetch
  useEffect(() => {
    fetchServer();
  }, [fetchServer]);

  // Fetch console info when server has a container
  useEffect(() => {
    if (server?.containerId) {
      fetchConsoleInfo();
    }
  }, [server?.containerId, fetchConsoleInfo]);

  const start = useCallback(async () => {
    try {
      await serversApi.start(serverId);
      toast.success("Server starting...");
      // Refetch server to get updated status
      setTimeout(fetchServer, 1000);
    } catch (err) {
      toast.error("Failed to start server");
      throw err;
    }
  }, [serverId, fetchServer]);

  const stop = useCallback(async () => {
    try {
      await serversApi.stop(serverId);
      toast.success("Server stopping...");
      setTimeout(fetchServer, 1000);
    } catch (err) {
      toast.error("Failed to stop server");
      throw err;
    }
  }, [serverId, fetchServer]);

  const restart = useCallback(async () => {
    try {
      await serversApi.restart(serverId);
      toast.success("Server restarting...");
      setTimeout(fetchServer, 1000);
    } catch (err) {
      toast.error("Failed to restart server");
      throw err;
    }
  }, [serverId, fetchServer]);

  const kill = useCallback(async () => {
    try {
      await serversApi.kill(serverId);
      toast.success("Server killed");
      setTimeout(fetchServer, 500);
    } catch (err) {
      toast.error("Failed to kill server");
      throw err;
    }
  }, [serverId, fetchServer]);

  const sendCommand = useCallback(async (command: string) => {
    try {
      await serversApi.command(serverId, command);
    } catch (err) {
      toast.error("Failed to send command");
      throw err;
    }
  }, [serverId]);

  return (
    <ServerContext.Provider
      value={{
        server,
        consoleInfo,
        isLoading,
        error,
        refetch: fetchServer,
        refreshConsoleInfo: fetchConsoleInfo,
        start,
        stop,
        restart,
        kill,
        sendCommand,
      }}
    >
      {children}
    </ServerContext.Provider>
  );
}
