"use client";

import { useState, useEffect, type JSX } from "react";
import { useParams } from "next/navigation";
import { useTheme as useNextTheme } from "next-themes";
import { DragDropGrid, GridItem } from "@workspace/ui/components/shared/DragDropGrid";
import { useGridStorage } from "@workspace/ui/hooks/useGridStorage";
import { InfoRow } from "@workspace/ui/components/shared/InfoTooltip";
import { Console } from "@workspace/ui/components/shared/Console";
import { Button } from "@workspace/ui/components/button";
import { cn } from "@workspace/ui/lib/utils";
import { BsSun, BsMoon, BsGrid } from "react-icons/bs";
import { AnimatedBackground } from "@workspace/ui/components/shared/AnimatedBackground";
import { FadeIn, FloatingDots } from "@workspace/ui/components/shared/Animations";
import { Badge } from "@workspace/ui/components/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@workspace/ui/components/sheet";
import { SidebarTrigger } from "@workspace/ui/components/sidebar";
import { Spinner } from "@workspace/ui/components/spinner";
import {
  CpuCard,
  UsageMetricCard,
  NetworkUsageCard,
  SystemInformationCard,
  NetworkInfoCard,
  InstanceNameCard,
  ContainerControlsCard,
  ContainerUptimeCard,
  PlayersOnlineCard,
  RecentLogsCard,
  CardPreview,
} from "@workspace/ui/components/shared/DashboardCards";
import { ThemeContext } from "../../../../contexts/ThemeContext";
import { useLabels } from "../../../../hooks";
import { defaultGridItems, defaultHiddenCards } from "../../../../constants";
import { useServer } from "@/components/server-provider";
import { useConsoleWebSocket } from "@/hooks/useConsoleWebSocket";
import { useStatsWebSocket } from "@/hooks/useStatsWebSocket";
import type { ServerStats } from "@/lib/api";

interface StatsWithHistory {
  current: ServerStats | null;
  cpuHistory: number[];
  memoryHistory: number[];
  diskReadHistory: number[];
  diskWriteHistory: number[];
  networkRxHistory: number[];
  networkTxHistory: number[];
  networkRxRate: number;
  networkTxRate: number;
}

// Build display data from real server and stats (with history)
function buildDisplayData(server: any, statsData: StatsWithHistory) {
  const stats = statsData.current;
  const cpuPercent = stats?.cpu?.usage_percent ?? 0;
  const memUsed = stats?.memory?.usage ? stats.memory.usage / (1024 * 1024 * 1024) : 0;
  const memLimit = stats?.memory?.limit ? stats.memory.limit / (1024 * 1024 * 1024) : (server?.memory ? server.memory / 1024 : 1);
  const memPercent = stats?.memory?.usage_percent ?? 0;
  const diskUsed = 0; // Disk usage not provided by container stats
  const diskLimit = server?.disk ? server.disk / 1024 : 10;
  const diskPercent = diskLimit > 0 ? (diskUsed / diskLimit) * 100 : 0;

  // Use network rate from statsData (bytes/sec)
  const netRxRate = statsData.networkRxRate ?? 0;
  const netTxRate = statsData.networkTxRate ?? 0;

  // Build location string from node's location
  const getLocationString = () => {
    if (server?.node?.location) {
      const loc = server.node.location;
      const parts = [loc.city, loc.country].filter(Boolean);
      return parts.length > 0 ? parts.join(", ") : server.node.displayName;
    }
    return server?.node?.displayName || "Unknown";
  };

  return {
    name: server?.name || "Server",
    status: server?.status?.toLowerCase() || "stopped",
    cpu: {
      usage: { percentage: cpuPercent, history: statsData.cpuHistory },
      cores: stats?.cpu?.online_cpus ?? 4,
      frequency: 3.5,
      model: "CPU",
      architecture: "x86_64",
      baseFrequency: 3.5,
      boostFrequency: 4.5,
      tdp: 65,
      cache: "16MB",
      coreUsage: [] as { id: number; percentage: number; frequency: number }[],
    },
    memory: {
      usage: { percentage: memPercent, history: statsData.memoryHistory },
      used: parseFloat(memUsed.toFixed(2)),
      total: parseFloat(memLimit.toFixed(2)),
      type: "DDR4",
      speed: 3200,
      channels: "Dual",
      slots: "2/4",
      timings: "16-18-18-36",
    },
    disk: {
      usage: { percentage: diskPercent, history: [] as number[] },
      used: parseFloat(diskUsed.toFixed(1)),
      total: parseFloat(diskLimit.toFixed(1)),
      type: "NVMe SSD",
      model: "Storage",
      interface: "NVMe",
      readSpeed: "3500 MB/s",
      writeSpeed: "3000 MB/s",
      health: 100,
    },
    network: {
      download: Math.round(netRxRate / 1024), // KB/s
      upload: Math.round(netTxRate / 1024), // KB/s
      downloadHistory: statsData.networkRxHistory.map(b => Math.round(b / 1024)),
      uploadHistory: statsData.networkTxHistory.map(b => Math.round(b / 1024)),
    },
    networkConfig: {
      publicIp: server?.allocations?.[0]?.ip || "0.0.0.0",
      privateIp: "10.0.0.1",
      openPorts: server?.allocations?.map((a: any) => ({ port: a.port, protocol: "TCP" })) || [],
      macAddress: "00:00:00:00:00:00",
      ipAddress: server?.allocations?.[0]?.ip || "0.0.0.0",
      port: server?.allocations?.[0]?.port || 25565,
      interface: "eth0",
      adapter: "Virtual",
      speed: "1 Gbps",
      gateway: "10.0.0.1",
      dns: "8.8.8.8",
    },
    system: {
      os: "Linux",
      osVersion: "Debian 12",
    },
    node: server?.node ? {
      id: server.node.id || "unknown",
      name: server.node.displayName || "Node",
      location: getLocationString(),
      provider: "StellarStack",
    } : null,
    gameServer: {
      players: [] as { id: string; name: string; joinedAt: number }[],
      maxPlayers: 20,
    },
    containerUptime: 0, // Could calculate from container start time
    recentLogs: [] as { level: string; message: string; time: string }[],
  };
}

const ServerOverviewPage = (): JSX.Element | null => {
  const params = useParams();
  const serverId = params.id as string;

  const [isEditing, setIsEditing] = useState(false);
  const [isCardSheetOpen, setIsCardSheetOpen] = useState(false);
  const { setTheme, resolvedTheme } = useNextTheme();
  const [mounted, setMounted] = useState(false);
  const labels = useLabels();

  const { server, consoleInfo, isLoading, start, stop, restart, kill, refetch } = useServer();

  // Connect to daemon WebSocket for console streaming
  const { lines: rawConsoleLines, isConnected: consoleConnected, sendCommand: sendConsoleCommand } = useConsoleWebSocket({
    consoleInfo,
    enabled: server?.status === "RUNNING",
  });

  // Connect to daemon WebSocket for stats streaming
  const { stats: statsData, isConnected: statsConnected } = useStatsWebSocket({
    consoleInfo,
    enabled: server?.status === "RUNNING",
  });

  // Transform console lines to the format expected by Console component
  const consoleLines = rawConsoleLines.map((line, index) => ({
    id: `${line.timestamp.getTime()}-${index}`,
    timestamp: line.timestamp.getTime(),
    level: (line.type === "error" || line.type === "stderr" ? "error" : line.type === "info" ? "info" : "default") as "info" | "error" | "default",
    message: line.text,
  }));

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = mounted ? resolvedTheme === "dark" : true;

  const { items, visibleItems, layouts, hiddenCards, isLoaded, saveLayout, resetLayout, showCard, hideCard } = useGridStorage({
    key: `stellarstack-dashboard-layout-${serverId}`,
    defaultItems: defaultGridItems,
    defaultHiddenCards: defaultHiddenCards,
  });

  // Build display data from real server and WebSocket stats
  const displayData = buildDisplayData(server, statsData);
  const isOffline = !server || server.status === "STOPPED" || server.status === "ERROR";

  const handleCommand = (command: string) => {
    sendConsoleCommand(command);
  };

  const containerControls = {
    status: displayData.status,
    handleStart: async () => {
      await start();
      refetch();
    },
    handleStop: async () => {
      await stop();
      refetch();
    },
    handleKill: async () => {
      await kill();
      refetch();
    },
    handleRestart: async () => {
      await restart();
      refetch();
    },
  };

  const getStatusLabel = (): string => {
    if (!server) return labels.status.offline;
    switch (server.status) {
      case "RUNNING": return labels.status.online;
      case "STARTING": return labels.status.starting;
      case "STOPPING": return labels.status.stopping;
      case "STOPPED": return labels.status.stopped;
      case "ERROR": return "ERROR";
      default: return labels.status.stopped;
    }
  };

  if (!mounted || !isLoaded) {
    return null;
  }

  if (isLoading) {
    return (
      <div className={cn(
        "min-h-svh flex items-center justify-center",
        isDark ? "bg-[#0b0b0a]" : "bg-[#f5f5f4]"
      )}>
        <div className="flex items-center gap-3">
          <Spinner className="w-5 h-5" />
          <span className={cn("text-sm", isDark ? "text-zinc-400" : "text-zinc-600")}>
            Loading server...
          </span>
        </div>
      </div>
    );
  }

  return (
    <ThemeContext.Provider value={{ isDark }}>
      <div className={cn(
        "min-h-svh transition-colors relative",
        isDark ? "bg-[#0b0b0a]" : "bg-[#f5f5f4]"
      )}>
        <AnimatedBackground isDark={isDark} />
        <FloatingDots isDark={isDark} count={15} />

        <div className="relative p-8">
          <FadeIn delay={0}>
            <div className="max-w-7xl mx-auto mb-6 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <SidebarTrigger className={cn(
                  "transition-all hover:scale-110 active:scale-95",
                  isDark ? "text-zinc-400 hover:text-zinc-100" : "text-zinc-600 hover:text-zinc-900"
                )} />
                <div>
                  <h1 className={cn(
                    "text-2xl font-light tracking-wider",
                    isDark ? "text-zinc-100" : "text-zinc-800"
                  )}>
                    OVERVIEW
                  </h1>
                  <p className={cn(
                    "text-sm mt-1",
                    isDark ? "text-zinc-500" : "text-zinc-500"
                  )}>
                    {server?.name || `Server ${serverId}`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {isEditing && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setIsCardSheetOpen(true)}
                      className={cn(
                        "transition-all hover:scale-[1.02] active:scale-95",
                        isDark
                          ? "border-zinc-700 text-zinc-400 hover:text-zinc-100 hover:border-zinc-500"
                          : "border-zinc-300 text-zinc-600 hover:text-zinc-900 hover:border-zinc-400"
                      )}
                    >
                      <BsGrid className="w-4 h-4 mr-2" />
                      {labels.dashboard.manageCards}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={resetLayout}
                      className={cn(
                        "transition-all hover:scale-[1.02] active:scale-95",
                        isDark
                          ? "border-zinc-700 text-zinc-400 hover:text-zinc-100 hover:border-zinc-500"
                          : "border-zinc-300 text-zinc-600 hover:text-zinc-900 hover:border-zinc-400"
                      )}
                    >
                      {labels.dashboard.resetLayout}
                    </Button>
                  </>
                )}
                <Button
                  variant={isEditing ? "default" : "outline"}
                  size="sm"
                  onClick={() => setIsEditing(!isEditing)}
                  className={cn(
                    "transition-all hover:scale-[1.02] active:scale-95",
                    isEditing && (isDark ? "bg-zinc-100 text-zinc-900 hover:bg-zinc-200" : "bg-zinc-800 text-zinc-100 hover:bg-zinc-700"),
                    !isEditing && (isDark
                      ? "border-zinc-700 text-zinc-400 hover:text-zinc-100 hover:border-zinc-500"
                      : "border-zinc-300 text-zinc-600 hover:text-zinc-900 hover:border-zinc-400")
                  )}
                >
                  {isEditing ? labels.dashboard.doneEditing : labels.dashboard.editLayout}
                </Button>
                <Badge
                  variant="outline"
                  className={cn(
                    "text-xs font-medium bg-transparent uppercase",
                    server?.status === "ERROR" && "border-red-500 text-red-500",
                    server?.status === "RUNNING" && "border-green-500 text-green-500",
                    server?.status === "STOPPED" && "border-zinc-500 text-zinc-500",
                    server?.status === "STARTING" && "border-amber-500 text-amber-500",
                    server?.status === "STOPPING" && "border-amber-500 text-amber-500",
                    server?.status === "INSTALLING" && "border-blue-500 text-blue-500"
                  )}
                >
                  {getStatusLabel()}
                </Badge>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setTheme(isDark ? "light" : "dark")}
                  className={cn(
                    "transition-all hover:scale-110 active:scale-95 p-2",
                    isDark
                      ? "border-zinc-700 text-zinc-400 hover:text-zinc-100 hover:border-zinc-500"
                      : "border-zinc-300 text-zinc-600 hover:text-zinc-900 hover:border-zinc-400"
                  )}
                >
                  {isDark ? <BsSun className="w-4 h-4" /> : <BsMoon className="w-4 h-4" />}
                </Button>
              </div>
            </div>
          </FadeIn>

          <Sheet open={isCardSheetOpen} onOpenChange={setIsCardSheetOpen}>
            <SheetContent
              side="right"
              className={cn(
                "w-[400px] sm:max-w-[450px] overflow-y-auto",
                isDark ? "bg-[#0f0f0f] border-zinc-800" : "bg-white border-zinc-200"
              )}
            >
              <SheetHeader>
                <SheetTitle className={isDark ? "text-zinc-100" : "text-zinc-900"}>
                  {labels.dashboard.availableCards}
                </SheetTitle>
                <SheetDescription className={isDark ? "text-zinc-400" : "text-zinc-600"}>
                  {labels.dashboard.availableCardsDescription}
                </SheetDescription>
              </SheetHeader>
              <div className="mt-6 space-y-4">
                {hiddenCards
                  .filter((cardId) => cardId !== "console")
                  .map((cardId) => (
                    <div
                      key={cardId}
                      onClick={() => showCard(cardId)}
                      className={cn(
                        "rounded-lg overflow-hidden cursor-pointer transition-all hover:scale-[1.02] hover:shadow-lg",
                        isDark ? "hover:shadow-black/50" : "hover:shadow-zinc-300/50"
                      )}
                    >
                      <div className="h-[120px] pointer-events-none">
                        <CardPreview cardId={cardId} isDark={isDark} server={displayData} />
                      </div>
                    </div>
                  ))}
                {hiddenCards.filter((id) => id !== "console").length === 0 && (
                  <div className={cn(
                    "text-center py-8 text-sm",
                    isDark ? "text-zinc-500" : "text-zinc-400"
                  )}>
                    {labels.dashboard.allCardsOnDashboard}
                    <br />
                    {labels.dashboard.removeCardsHint}
                  </div>
                )}
              </div>
            </SheetContent>
          </Sheet>

          <DragDropGrid
            className="max-w-7xl mx-auto"
            items={visibleItems}
            allItems={items}
            savedLayouts={layouts}
            onLayoutChange={saveLayout}
            onDropItem={(itemId) => showCard(itemId)}
            onRemoveItem={(itemId) => hideCard(itemId)}
            rowHeight={50}
            gap={16}
            isEditing={isEditing}
            isDark={isDark}
            isDroppable={true}
            removeConfirmLabels={labels.removeCard}
          >
            {!hiddenCards.includes("instance-name") && (
              <div key="instance-name" className="h-full">
                <GridItem itemId="instance-name">
                  <InstanceNameCard itemId="instance-name" isDark={isDark} instanceName={displayData.name} />
                </GridItem>
              </div>
            )}

            {!hiddenCards.includes("container-controls") && (
              <div key="container-controls" className="h-full">
                <GridItem itemId="container-controls">
                  <ContainerControlsCard
                    itemId="container-controls"
                    isDark={isDark}
                    isOffline={isOffline}
                    status={containerControls.status}
                    onStart={containerControls.handleStart}
                    onStop={containerControls.handleStop}
                    onKill={containerControls.handleKill}
                    onRestart={containerControls.handleRestart}
                    labels={labels.containerControls}
                  />
                </GridItem>
              </div>
            )}

            {!hiddenCards.includes("system-info") && displayData.node && (
              <div key="system-info" className="h-full">
                <GridItem itemId="system-info">
                  <SystemInformationCard
                    itemId="system-info"
                    isDark={isDark}
                    nodeData={displayData.node}
                    labels={labels.systemInfo}
                  />
                </GridItem>
              </div>
            )}

            {!hiddenCards.includes("network-info") && displayData.networkConfig.openPorts && (
              <div key="network-info" className="h-full">
                <GridItem itemId="network-info">
                  <NetworkInfoCard
                    itemId="network-info"
                    isDark={isDark}
                    networkInfo={{
                      publicIp: displayData.networkConfig.publicIp || "",
                      privateIp: displayData.networkConfig.privateIp || "",
                      openPorts: displayData.networkConfig.openPorts,
                      macAddress: displayData.networkConfig.macAddress || "",
                    }}
                    labels={labels.networkInfo}
                  />
                </GridItem>
              </div>
            )}

            {!hiddenCards.includes("cpu") && (
              <div key="cpu" className="h-full">
                <GridItem itemId="cpu">
                  <CpuCard
                    itemId="cpu"
                    percentage={displayData.cpu.usage.percentage}
                    details={[`${displayData.cpu.cores} ${labels.cpu.cores || "CORES"}`, `${displayData.cpu.frequency} GHz`]}
                    history={displayData.cpu.usage.history}
                    coreUsage={displayData.cpu.coreUsage}
                    isDark={isDark}
                    isOffline={isOffline}
                    labels={labels.cpu}
                    tooltipContent={
                      <>
                        <InfoRow label={labels.tooltip.cpu.model} value={displayData.cpu.model || ""} isDark={isDark} />
                        <InfoRow label={labels.tooltip.cpu.architecture} value={displayData.cpu.architecture || ""} isDark={isDark} />
                        <InfoRow label={labels.tooltip.cpu.baseClock} value={`${displayData.cpu.baseFrequency || 0} GHz`} isDark={isDark} />
                        <InfoRow label={labels.tooltip.cpu.boostClock} value={`${displayData.cpu.boostFrequency || 0} GHz`} isDark={isDark} />
                        <InfoRow label={labels.tooltip.cpu.tdp} value={`${displayData.cpu.tdp || 0}W`} isDark={isDark} />
                        <InfoRow label={labels.tooltip.cpu.cache} value={displayData.cpu.cache || ""} isDark={isDark} />
                      </>
                    }
                  />
                </GridItem>
              </div>
            )}

            {!hiddenCards.includes("ram") && (
              <div key="ram" className="h-full">
                <GridItem itemId="ram">
                  <UsageMetricCard
                    itemId="ram"
                    percentage={displayData.memory.usage.percentage}
                    details={[`${displayData.memory.used} / ${displayData.memory.total} GB`, displayData.memory.type || ""]}
                    history={displayData.memory.usage.history}
                    isDark={isDark}
                    isOffline={isOffline}
                    labels={labels.ram}
                    tooltipContent={
                      <>
                        <InfoRow label={labels.tooltip.ram.type} value={displayData.memory.type || ""} isDark={isDark} />
                        <InfoRow label={labels.tooltip.ram.speed} value={`${displayData.memory.speed || 0} MT/s`} isDark={isDark} />
                        <InfoRow label={labels.tooltip.ram.channels} value={displayData.memory.channels || ""} isDark={isDark} />
                        <InfoRow label={labels.tooltip.ram.slotsUsed} value={displayData.memory.slots || ""} isDark={isDark} />
                        <InfoRow label={labels.tooltip.ram.timings} value={displayData.memory.timings || ""} isDark={isDark} />
                      </>
                    }
                  />
                </GridItem>
              </div>
            )}

            {!hiddenCards.includes("disk") && (
              <div key="disk" className="h-full">
                <GridItem itemId="disk">
                  <UsageMetricCard
                    itemId="disk"
                    percentage={displayData.disk.usage.percentage}
                    details={[`${displayData.disk.used} / ${displayData.disk.total} GB`, displayData.disk.type || ""]}
                    history={displayData.disk.usage.history}
                    isDark={isDark}
                    isOffline={isOffline}
                    labels={labels.disk}
                    tooltipContent={
                      <>
                        <InfoRow label={labels.tooltip.disk.model} value={displayData.disk.model || ""} isDark={isDark} />
                        <InfoRow label={labels.tooltip.disk.interface} value={displayData.disk.interface || ""} isDark={isDark} />
                        <InfoRow label={labels.tooltip.disk.readSpeed} value={displayData.disk.readSpeed || ""} isDark={isDark} />
                        <InfoRow label={labels.tooltip.disk.writeSpeed} value={displayData.disk.writeSpeed || ""} isDark={isDark} />
                        <InfoRow label={labels.tooltip.disk.health} value={`${displayData.disk.health || 0}%`} isDark={isDark} />
                      </>
                    }
                  />
                </GridItem>
              </div>
            )}

            {!hiddenCards.includes("network-usage") && (
              <div key="network-usage" className="h-full">
                <GridItem itemId="network-usage">
                  <NetworkUsageCard
                    itemId="network-usage"
                    download={displayData.network.download}
                    upload={displayData.network.upload}
                    downloadHistory={displayData.network.downloadHistory}
                    uploadHistory={displayData.network.uploadHistory}
                    isDark={isDark}
                    isOffline={isOffline}
                    labels={labels.network}
                    tooltipData={displayData.networkConfig.interface ? {
                      interface: displayData.networkConfig.interface,
                      adapter: displayData.networkConfig.adapter || "",
                      speed: displayData.networkConfig.speed || "",
                      ipv4: displayData.networkConfig.ipAddress,
                      gateway: displayData.networkConfig.gateway || "",
                      dns: displayData.networkConfig.dns || "",
                    } : undefined}
                  />
                </GridItem>
              </div>
            )}

            {!hiddenCards.includes("console") && (
              <div key="console" className="h-full">
                <GridItem itemId="console" showRemoveHandle={false}>
                  <Console lines={consoleLines} onCommand={handleCommand} isDark={isDark} isOffline={isOffline} />
                </GridItem>
              </div>
            )}

            {!hiddenCards.includes("players-online") && (
              <div key="players-online" className="h-full">
                <GridItem itemId="players-online">
                  <PlayersOnlineCard
                    itemId="players-online"
                    isDark={isDark}
                    isOffline={isOffline}
                    players={displayData.gameServer?.players || []}
                    maxPlayers={displayData.gameServer?.maxPlayers || 20}
                    containerStatus={displayData.status}
                    labels={labels.playersOnline}
                  />
                </GridItem>
              </div>
            )}

            {!hiddenCards.includes("container-uptime") && (
              <div key="container-uptime" className="h-full">
                <GridItem itemId="container-uptime">
                  <ContainerUptimeCard
                    itemId="container-uptime"
                    isDark={isDark}
                    isOffline={isOffline}
                    containerUptime={displayData.containerUptime || 0}
                    containerStatus={displayData.status}
                    labels={labels.containerUptime}
                  />
                </GridItem>
              </div>
            )}

            {!hiddenCards.includes("recent-logs") && (
              <div key="recent-logs" className="h-full">
                <GridItem itemId="recent-logs">
                  <RecentLogsCard
                    itemId="recent-logs"
                    isDark={isDark}
                    isOffline={isOffline}
                    logs={displayData.recentLogs || []}
                    labels={labels.recentLogs}
                  />
                </GridItem>
              </div>
            )}
          </DragDropGrid>
        </div>
      </div>
    </ThemeContext.Provider>
  );
};

export default ServerOverviewPage;
