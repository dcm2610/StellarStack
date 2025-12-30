"use client";

import { useState, useEffect, type JSX } from "react";
import { useParams } from "next/navigation";
import { useTheme as useNextTheme } from "next-themes";
import { cn } from "@workspace/ui/lib/utils";
import { Button } from "@workspace/ui/components/button";
import { Console } from "@workspace/ui/components/console";
import { SidebarTrigger } from "@workspace/ui/components/sidebar";
import { BsSun, BsMoon } from "react-icons/bs";
import { PlayIcon, SquareIcon, RotateCwIcon, SkullIcon, WifiIcon, WifiOffIcon } from "lucide-react";
import { useServer } from "@/components/server-provider";
import { useServerWebSocket } from "@/hooks/useServerWebSocket";
import { ServerInstallingPlaceholder } from "@/components/server-installing-placeholder";
import { ServerSuspendedPlaceholder } from "@/components/server-suspended-placeholder";

const ConsolePage = (): JSX.Element | null => {
  const params = useParams();
  const serverId = params.id as string;
  const { setTheme, resolvedTheme } = useNextTheme();
  const [mounted, setMounted] = useState(false);

  const {
    server,
    isInstalling,
    consoleInfo,
    start,
    stop,
    restart,
    kill,
    refetch,
    powerActionLoading,
  } = useServer();

  // Enable WebSocket if we have consoleInfo
  const wsEnabled = !!consoleInfo;

  // WebSocket for console
  const {
    lines: rawConsoleLines,
    isConnected: wsConnected,
    isConnecting: wsConnecting,
    sendCommand: sendConsoleCommand,
  } = useServerWebSocket({
    consoleInfo,
    enabled: wsEnabled,
  });

  // Transform console lines to the format expected by Console component
  const consoleLines = rawConsoleLines.map((line, index) => ({
    id: `${line.timestamp.getTime()}-${index}`,
    timestamp: line.timestamp.getTime(),
    level: (line.type === "error" || line.type === "stderr"
      ? "error"
      : line.type === "info"
        ? "info"
        : "default") as "info" | "error" | "default",
    message: line.text,
  }));

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = mounted ? resolvedTheme === "dark" : true;

  if (!mounted) return null;

  if (isInstalling) {
    return (
      <div className="min-h-svh">
        <ServerInstallingPlaceholder isDark={isDark} serverName={server?.name} />
      </div>
    );
  }

  if (server?.status === "SUSPENDED") {
    return (
      <div className="min-h-svh">
        <ServerSuspendedPlaceholder isDark={isDark} serverName={server?.name} />
      </div>
    );
  }

  const isRunning = server?.status === "RUNNING";
  const isStopped = server?.status === "STOPPED";
  const isTransitioning = server?.status === "STARTING" || server?.status === "STOPPING";

  const handleCommand = (command: string) => {
    sendConsoleCommand(command);
  };

  const handleStart = async () => {
    await start();
    refetch();
  };

  const handleStop = async () => {
    await stop();
    refetch();
  };

  const handleRestart = async () => {
    await restart();
    refetch();
  };

  const handleKill = async () => {
    await kill();
    refetch();
  };

  const buttonClasses = cn(
    "gap-2 transition-all text-xs uppercase tracking-wider",
    isDark
      ? "border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-100"
      : "border-zinc-300 text-zinc-600 hover:border-zinc-400 hover:text-zinc-900"
  );

  const disabledClasses = "opacity-50 cursor-not-allowed";

  return (
    <div className="relative flex min-h-svh flex-col transition-colors">
      <div className="relative flex flex-1 flex-col p-8">
        <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col">
          {/* Header */}
          <div className="mb-6 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <SidebarTrigger
                className={cn(
                  "transition-all hover:scale-110 active:scale-95",
                  isDark ? "text-zinc-400 hover:text-zinc-100" : "text-zinc-600 hover:text-zinc-900"
                )}
              />
              <div>
                <h1
                  className={cn(
                    "text-2xl font-light tracking-wider",
                    isDark ? "text-zinc-100" : "text-zinc-800"
                  )}
                >
                  CONSOLE
                </h1>
                <div className="mt-1 flex items-center gap-3">
                  <p className={cn("text-sm", isDark ? "text-zinc-500" : "text-zinc-500")}>
                    {server?.name || `Server ${serverId}`}
                  </p>
                  <div className="flex items-center gap-1.5">
                    {wsConnected ? (
                      <WifiIcon
                        className={cn("h-3 w-3", isDark ? "text-green-400" : "text-green-600")}
                      />
                    ) : wsConnecting ? (
                      <WifiIcon
                        className={cn(
                          "h-3 w-3 animate-pulse",
                          isDark ? "text-amber-400" : "text-amber-600"
                        )}
                      />
                    ) : (
                      <WifiOffIcon
                        className={cn("h-3 w-3", isDark ? "text-zinc-500" : "text-zinc-400")}
                      />
                    )}
                    <span className={cn("text-xs", isDark ? "text-zinc-600" : "text-zinc-400")}>
                      {wsConnected ? "Connected" : wsConnecting ? "Connecting..." : "Disconnected"}
                    </span>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Power Controls */}
              <Button
                variant="outline"
                size="sm"
                onClick={handleStart}
                disabled={!isStopped || powerActionLoading.start}
                className={cn(
                  buttonClasses,
                  (!isStopped || powerActionLoading.start) && disabledClasses
                )}
              >
                <PlayIcon className="h-3 w-3" />
                Start
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleStop}
                disabled={!isRunning || powerActionLoading.stop}
                className={cn(
                  buttonClasses,
                  (!isRunning || powerActionLoading.stop) && disabledClasses
                )}
              >
                <SquareIcon className="h-3 w-3" />
                Stop
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRestart}
                disabled={isStopped || isTransitioning || powerActionLoading.restart}
                className={cn(
                  buttonClasses,
                  (isStopped || isTransitioning || powerActionLoading.restart) && disabledClasses
                )}
              >
                <RotateCwIcon className="h-3 w-3" />
                Restart
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleKill}
                disabled={isStopped || powerActionLoading.kill}
                className={cn(
                  buttonClasses,
                  (isStopped || powerActionLoading.kill) && disabledClasses,
                  !isStopped &&
                    !powerActionLoading.kill &&
                    (isDark
                      ? "hover:border-red-700 hover:text-red-400"
                      : "hover:border-red-400 hover:text-red-600")
                )}
              >
                <SkullIcon className="h-3 w-3" />
                Kill
              </Button>

              <div className={cn("mx-2 h-6 w-px", isDark ? "bg-zinc-700" : "bg-zinc-300")} />

              <Button
                variant="outline"
                size="sm"
                onClick={() => setTheme(isDark ? "light" : "dark")}
                className={cn(
                  "p-2 transition-all hover:scale-110 active:scale-95",
                  isDark
                    ? "border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-100"
                    : "border-zinc-300 text-zinc-600 hover:border-zinc-400 hover:text-zinc-900"
                )}
              >
                {isDark ? <BsSun className="h-4 w-4" /> : <BsMoon className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          {/* Console */}
          <div
            className={cn(
              "relative flex-1 border",
              isDark
                ? "border-zinc-200/10 bg-gradient-to-b from-[#141414] via-[#0f0f0f] to-[#0a0a0a]"
                : "border-zinc-300 bg-gradient-to-b from-white via-zinc-50 to-zinc-100"
            )}
            style={{ minHeight: "calc(100vh - 200px)" }}
          >
            {/* Corner decorations */}
            <div
              className={cn(
                "absolute top-0 left-0 h-3 w-3 border-t border-l",
                isDark ? "border-zinc-500" : "border-zinc-400"
              )}
            />
            <div
              className={cn(
                "absolute top-0 right-0 h-3 w-3 border-t border-r",
                isDark ? "border-zinc-500" : "border-zinc-400"
              )}
            />
            <div
              className={cn(
                "absolute bottom-0 left-0 h-3 w-3 border-b border-l",
                isDark ? "border-zinc-500" : "border-zinc-400"
              )}
            />
            <div
              className={cn(
                "absolute right-0 bottom-0 h-3 w-3 border-r border-b",
                isDark ? "border-zinc-500" : "border-zinc-400"
              )}
            />

            <Console
              lines={consoleLines}
              onCommand={isRunning ? handleCommand : undefined}
              isDark={isDark}
              isOffline={!wsConnected}
              className="h-full"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConsolePage;
