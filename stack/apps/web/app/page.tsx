"use client";

import { useState, useEffect, useCallback, createContext, useContext } from "react";
import { useServerStore } from "../stores/connectionStore";
import { UsageCard, UsageCardContent, UsageCardTitle } from "@workspace/ui/components/shared/UsageCard/UsageCard";
import { DragDropGrid, GridItem, useDragDropGrid, type GridItemConfig } from "@workspace/ui/components/shared/DragDropGrid";
import { useGridStorage } from "@workspace/ui/hooks/useGridStorage";
import { InfoTooltip, InfoRow } from "@workspace/ui/components/shared/InfoTooltip";
import { Console, generateInitialLines, generateRandomLine, type ConsoleLine } from "@workspace/ui/components/shared/Console";
import { Button } from "@workspace/ui/components/button";
import { Spinner } from "@workspace/ui/components/spinner";
import { cn } from "@workspace/ui/lib/utils";
import { BsSun, BsMoon, BsGrid } from "react-icons/bs";
import { Sparkline, DualSparkline } from "@workspace/ui/components/shared/Sparkline";
import { AnimatedBackground } from "@workspace/ui/components/shared/AnimatedBackground";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@workspace/ui/components/sheet";
import { SidebarTrigger } from "@workspace/ui/components/sidebar";
import { toast } from "sonner";

// Theme context
const ThemeContext = createContext<{ isDark: boolean }>({ isDark: true });
const useTheme = () => useContext(ThemeContext);

// Hook to handle simulation ticks and offline events
function useServerSimulation() {
  const { isOffline, setOffline, tickResources } = useServerStore();

  // Random offline events
  useEffect(() => {
    const offlineInterval = setInterval(() => {
      if (!isOffline && Math.random() < 0.02) {
        setOffline(true);
        const toastId = toast.loading("Connection Lost - Reconnecting...", {
          duration: Infinity,
        });
        const reconnectTime = 3000 + Math.random() * 5000;
        setTimeout(() => {
          setOffline(false);
          toast.dismiss(toastId);
          toast.success("Connection Restored", { duration: 2000 });
        }, reconnectTime);
      }
    }, 1000);

    return () => clearInterval(offlineInterval);
  }, [isOffline, setOffline]);

  // Resource tick updates
  useEffect(() => {
    const interval = setInterval(() => {
      tickResources();
    }, 1000);

    return () => clearInterval(interval);
  }, [tickResources]);
}

// Card metadata for display in the management sheet
const cardMetadata: Record<string, { name: string; description: string }> = {
  "instance-name": { name: "Instance Name", description: "Display the server instance name" },
  "container-controls": { name: "Container Controls", description: "Start, stop, restart, and kill controls" },
  "system-info": { name: "System Information", description: "Node details including location and ID" },
  "network-info": { name: "Network Info", description: "IP addresses and open ports" },
  "cpu": { name: "CPU Usage", description: "Real-time CPU utilization with history" },
  "ram": { name: "RAM Usage", description: "Memory usage with history graph" },
  "disk": { name: "Disk Usage", description: "Storage utilization with history" },
  "network-usage": { name: "Network Usage", description: "Download and upload speeds" },
  "console": { name: "Console", description: "Server console with command input" },
};

// Define the default grid items with their sizes
const defaultGridItems: GridItemConfig[] = [
  { i: "instance-name", size: "xxs-wide", minSize: "xxs-wide", maxSize: "xxs-wide" },
  { i: "container-controls", size: "xxs-wide", minSize: "xxs-wide", maxSize: "xxs-wide" },
  { i: "system-info", size: "md", minSize: "xs", maxSize: "md" },
  { i: "network-info", size: "md", minSize: "xs", maxSize: "md" },
  { i: "cpu", size: "xs", minSize: "xxs", maxSize: "sm" },
  { i: "ram", size: "xs", minSize: "xxs", maxSize: "sm" },
  { i: "disk", size: "xs", minSize: "xxs", maxSize: "sm" },
  { i: "network-usage", size: "xs", minSize: "xxs", maxSize: "sm" },
  { i: "console", size: "xxl", minSize: "md", maxSize: "xxl" },
];

// Loading spinner for the dashboard
function DashboardLoading() {
  return (
    <div className="min-h-svh bg-[#0b0b0a] bg-[radial-gradient(circle,_rgba(255,255,255,0.15)_1px,_transparent_1px)] bg-[length:24px_24px] flex items-center justify-center">
      <Spinner className="size-8 text-zinc-400" />
    </div>
  );
}

// Hook for simulated console lines
function useSimulatedConsole() {
  const [lines, setLines] = useState<ConsoleLine[]>(() => generateInitialLines(25));
  const isOffline = useServerStore((state) => state.isOffline);
  const containerStatus = useServerStore((state) => state.server.status);

  const shouldGenerateLines = !isOffline && containerStatus === "running";

  // Clear console when container stops
  useEffect(() => {
    if (containerStatus === "stopped") {
      setLines([]);
    }
  }, [containerStatus]);

  useEffect(() => {
    // Don't generate lines when offline or container is not running
    if (!shouldGenerateLines) return;

    // Add a new line every 2-5 seconds randomly
    const addLine = () => {
      setLines((prev) => [...prev.slice(-99), generateRandomLine()]);
    };

    const scheduleNext = () => {
      const delay = 2000 + Math.random() * 3000;
      return setTimeout(() => {
        addLine();
        timeoutId = scheduleNext();
      }, delay);
    };

    let timeoutId = scheduleNext();
    return () => clearTimeout(timeoutId);
  }, [shouldGenerateLines]);

  const handleCommand = useCallback((command: string) => {
    // Add the command as a user input line
    setLines((prev) => [
      ...prev,
      {
        id: `cmd-${Date.now()}`,
        timestamp: Date.now(),
        level: "default" as const,
        message: `> ${command}`,
      },
    ]);

    // Simulate a response after a short delay
    setTimeout(() => {
      setLines((prev) => [
        ...prev,
        {
          id: `resp-${Date.now()}`,
          timestamp: Date.now(),
          level: "info" as const,
          message: `Daemon: Command "${command}" executed`,
        },
      ]);
    }, 500);
  }, []);

  return { lines, handleCommand };
}

export default function Page() {
  const [isEditing, setIsEditing] = useState(false);
  const [isDark, setIsDark] = useState(true);
  const [isCardSheetOpen, setIsCardSheetOpen] = useState(false);
  const { items, visibleItems, layouts, hiddenCards, isLoaded, saveLayout, resetLayout, showCard, hideCard } = useGridStorage({
    key: "stellarstack-dashboard-layout",
    defaultItems: defaultGridItems,
  });

  // Start server simulation (resource ticks + random offline events)
  useServerSimulation();

  // Get data from the store
  const server = useServerStore((state) => state.server);
  const isOffline = useServerStore((state) => state.isOffline);
  const { lines: consoleLines, handleCommand } = useSimulatedConsole();

  // Show spinner while loading from localStorage
  if (!isLoaded) {
    return <DashboardLoading />;
  }

  return (
    <ThemeContext.Provider value={{ isDark }}>
    <div className={cn(
      "min-h-svh transition-colors relative",
      isDark ? "bg-[#0b0b0a]" : "bg-[#f5f5f4]"
    )}>
      <AnimatedBackground isDark={isDark} />

      <div className="p-8">
        {/* Header with Edit Toggle */}
        <div className="mx-auto mb-6 flex items-center justify-between">
          <SidebarTrigger className={cn(
            "transition-colors",
            isDark ? "text-zinc-400 hover:text-zinc-100" : "text-zinc-600 hover:text-zinc-900"
          )} />
          <div className="flex items-center gap-2">
              {isEditing && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsCardSheetOpen(true)}
                    className={cn(
                      "transition-colors",
                      isDark
                        ? "border-zinc-700 text-zinc-400 hover:text-zinc-100 hover:border-zinc-500"
                        : "border-zinc-300 text-zinc-600 hover:text-zinc-900 hover:border-zinc-400"
                    )}
                  >
                    <BsGrid className="w-4 h-4 mr-2" />
                    Manage Cards
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={resetLayout}
                    className={cn(
                      "transition-colors",
                      isDark
                        ? "border-zinc-700 text-zinc-400 hover:text-zinc-100 hover:border-zinc-500"
                        : "border-zinc-300 text-zinc-600 hover:text-zinc-900 hover:border-zinc-400"
                    )}
                  >
                    Reset Layout
                  </Button>
                </>
              )}
              <Button
                variant={isEditing ? "default" : "outline"}
                size="sm"
                onClick={() => setIsEditing(!isEditing)}
                className={cn(
                  "transition-colors",
                  isEditing && (isDark ? "bg-zinc-100 text-zinc-900 hover:bg-zinc-200" : "bg-zinc-800 text-zinc-100 hover:bg-zinc-700"),
                  !isEditing && (isDark
                    ? "border-zinc-700 text-zinc-400 hover:text-zinc-100 hover:border-zinc-500"
                    : "border-zinc-300 text-zinc-600 hover:text-zinc-900 hover:border-zinc-400")
                )}
              >
                {isEditing ? "Done Editing" : "Edit Layout"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsDark(!isDark)}
                className={cn(
                  "transition-colors p-2",
                  isDark
                    ? "border-zinc-700 text-zinc-400 hover:text-zinc-100 hover:border-zinc-500"
                    : "border-zinc-300 text-zinc-600 hover:text-zinc-900 hover:border-zinc-400"
                )}
              >
                {isDark ? <BsSun className="w-4 h-4" /> : <BsMoon className="w-4 h-4" />}
              </Button>
            </div>
          </div>

          {/* Card Management Sheet */}
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
                  Available Cards
                </SheetTitle>
                <SheetDescription className={isDark ? "text-zinc-400" : "text-zinc-600"}>
                  Click a card to add it to your dashboard.
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
                        <CardPreview cardId={cardId} isDark={isDark} />
                      </div>
                    </div>
                  ))}
                {hiddenCards.filter((id) => id !== "console").length === 0 && (
                  <div className={cn(
                    "text-center py-8 text-sm",
                    isDark ? "text-zinc-500" : "text-zinc-400"
                  )}>
                    All cards are on your dashboard.
                    <br />
                    Remove cards using the X button to add them here.
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
          >
            {/* Instance Name */}
            {!hiddenCards.includes("instance-name") && (
              <div key="instance-name" className="h-full">
                <GridItem itemId="instance-name">
                  <InstanceNameCard itemId="instance-name" />
                </GridItem>
              </div>
            )}

            {/* Container Controls */}
            {!hiddenCards.includes("container-controls") && (
              <div key="container-controls" className="h-full">
                <GridItem itemId="container-controls">
                  <ContainerControlsCard itemId="container-controls" />
                </GridItem>
              </div>
            )}

            {/* System Information */}
            {!hiddenCards.includes("system-info") && (
              <div key="system-info" className="h-full">
                <GridItem itemId="system-info">
                  <SystemInformationCard itemId="system-info" />
                </GridItem>
              </div>
            )}

            {/* Network Info */}
            {!hiddenCards.includes("network-info") && (
              <div key="network-info" className="h-full">
                <GridItem itemId="network-info">
                  <NetworkInfoCard itemId="network-info" />
                </GridItem>
              </div>
            )}

            {/* CPU Usage */}
            {!hiddenCards.includes("cpu") && (
              <div key="cpu" className="h-full">
                <GridItem itemId="cpu">
                  <UsageMetricCard
                    itemId="cpu"
                    title="CPU"
                    percentage={server.cpu.usage.percentage}
                    details={[`${server.cpu.cores} CORES`, `${server.cpu.frequency} GHz`]}
                    history={server.cpu.usage.history}
                    tooltipContent={
                      <>
                        <InfoRow label="Model" value={server.cpu.model || "AMD Ryzen 9 9950X3D"} isDark={isDark} />
                        <InfoRow label="Architecture" value={server.cpu.architecture || "Zen 5"} isDark={isDark} />
                        <InfoRow label="Base Clock" value={`${server.cpu.baseFrequency || 4.3} GHz`} isDark={isDark} />
                        <InfoRow label="Boost Clock" value={`${server.cpu.boostFrequency || 5.7} GHz`} isDark={isDark} />
                        <InfoRow label="TDP" value={`${server.cpu.tdp || 170}W`} isDark={isDark} />
                        <InfoRow label="Cache" value={server.cpu.cache || "144MB"} isDark={isDark} />
                      </>
                    }
                  />
                </GridItem>
              </div>
            )}

            {/* RAM Usage */}
            {!hiddenCards.includes("ram") && (
              <div key="ram" className="h-full">
                <GridItem itemId="ram">
                  <UsageMetricCard
                    itemId="ram"
                    title="RAM"
                    percentage={server.memory.usage.percentage}
                    details={[`${server.memory.used} / ${server.memory.total} GB`, "DDR5"]}
                    history={server.memory.usage.history}
                    tooltipContent={
                      <>
                        <InfoRow label="Type" value={server.memory.type || "DDR5"} isDark={isDark} />
                        <InfoRow label="Speed" value={`${server.memory.speed || 6000} MT/s`} isDark={isDark} />
                        <InfoRow label="Channels" value={server.memory.channels || "Dual Channel"} isDark={isDark} />
                        <InfoRow label="Slots Used" value={server.memory.slots || "2 / 4"} isDark={isDark} />
                        <InfoRow label="Timings" value={server.memory.timings || "CL30-38-38"} isDark={isDark} />
                      </>
                    }
                  />
                </GridItem>
              </div>
            )}

            {/* Disk Usage */}
            {!hiddenCards.includes("disk") && (
              <div key="disk" className="h-full">
                <GridItem itemId="disk">
                  <UsageMetricCard
                    itemId="disk"
                    title="DISK"
                    percentage={server.disk.usage.percentage}
                    details={[`${server.disk.used} / ${server.disk.total} GB`, server.disk.type || "NVMe SSD"]}
                    history={server.disk.usage.history}
                    tooltipContent={
                      <>
                        <InfoRow label="Model" value={server.disk.model || "Samsung 990 Pro"} isDark={isDark} />
                        <InfoRow label="Interface" value={server.disk.interface || "PCIe 4.0 x4"} isDark={isDark} />
                        <InfoRow label="Read Speed" value={server.disk.readSpeed || "7,450 MB/s"} isDark={isDark} />
                        <InfoRow label="Write Speed" value={server.disk.writeSpeed || "6,900 MB/s"} isDark={isDark} />
                        <InfoRow label="Health" value={`${server.disk.health || 98}%`} isDark={isDark} />
                      </>
                    }
                  />
                </GridItem>
              </div>
            )}

            {/* Network Usage */}
            {!hiddenCards.includes("network-usage") && (
              <div key="network-usage" className="h-full">
                <GridItem itemId="network-usage">
                  <NetworkUsageCard
                    itemId="network-usage"
                    download={server.network.download}
                    upload={server.network.upload}
                    downloadHistory={server.network.downloadHistory}
                    uploadHistory={server.network.uploadHistory}
                  />
                </GridItem>
              </div>
            )}

            {/* Console - cannot be removed */}
            {!hiddenCards.includes("console") && (
              <div key="console" className="h-full">
                <GridItem itemId="console" showRemoveHandle={false}>
                  <Console lines={consoleLines} onCommand={handleCommand} isDark={isDark} isOffline={isOffline} />
                </GridItem>
              </div>
            )}
          </DragDropGrid>

        {/* Footer */}
        <footer className={cn(
          "mt-12 pb-4 text-center text-sm uppercase transition-colors",
          isDark ? "text-zinc-500" : "text-zinc-600"
        )}>
          &copy; {new Date().getFullYear()} StellarStack
        </footer>
      </div>
    </div>
    </ThemeContext.Provider>
  );
}

// Size-aware Usage Metric Card (CPU, RAM, DISK)
interface UsageMetricCardProps {
  itemId: string;
  title: string;
  percentage: number;
  details: string[];
  tooltipContent?: React.ReactNode;
  history?: number[];
  color?: string;
}

// Get color based on percentage
function getUsageColor(percentage: number, isDark: boolean = true): string {
  if (percentage === 0) return isDark ? "#71717a" : "#a1a1aa"; // gray when stopped
  if (percentage > 75) return "#ef4444"; // red
  if (percentage > 50) return "#f59e0b"; // amber
  return "#22c55e"; // green
}

function UsageMetricCard({ itemId, title, percentage, details, tooltipContent, history, color }: UsageMetricCardProps) {
  const { getItemSize, isEditing } = useDragDropGrid();
  const { isDark } = useTheme();
  const isOffline = useServerStore((state) => state.isOffline);
  const size = getItemSize(itemId);

  // Determine layout based on size
  const isXxs = size === "xxs" || size === "xxs-wide";
  const isXs = size === "xs";
  const isSm = size === "sm";
  const isMd = size === "md";
  const isCompact = size === "xs" || size === "sm" || size === "xxs" || size === "xxs-wide";
  const isLarge = size === "lg" || size === "xl";
  const showSparklineOnly = isSm || isMd || isLarge; // On SM, MD, LG, XL show sparkline instead of bar

  const sparklineColor = isOffline ? (isDark ? "#71717a" : "#a1a1aa") : (color || getUsageColor(percentage, isDark));

  // xxs/xxs-wide view: minimal horizontal layout with just title and percentage
  if (isXxs) {
    return (
      <UsageCard isDark={isDark} className={cn("h-full flex items-center justify-between px-6", isOffline && "opacity-60")}>
        <span className={cn("text-xs font-medium uppercase", isDark ? "text-zinc-400" : "text-zinc-600")}>{title}</span>
        <span className={cn("text-xl font-mono", isOffline ? (isDark ? "text-zinc-500" : "text-zinc-400") : (isDark ? "text-zinc-100" : "text-zinc-800"))}>
          {isOffline ? "--" : `${percentage}%`}
        </span>
      </UsageCard>
    );
  }

  return (
    <UsageCard isDark={isDark} className={cn("h-full", isXs && "p-4", isOffline && "opacity-60")}>
      {tooltipContent && (
        <InfoTooltip content={tooltipContent} visible={!isEditing} isDark={isDark} />
      )}
      <UsageCardTitle isDark={isDark} className={cn(
        "opacity-80",
        isXs ? "text-xs mb-2" : isCompact ? "text-xs mb-4" : "text-md"
      )}>
        {title}
      </UsageCardTitle>
      <UsageCardContent className={isXs ? "space-y-1" : undefined}>
        <span className={cn(
          isOffline ? (isDark ? "text-zinc-500" : "text-zinc-400") : (isDark ? "text-zinc-100" : "text-zinc-800"),
          isXs ? "text-xl" : isCompact ? "text-2xl" : isLarge ? "text-5xl" : "text-4xl"
        )}>
          {isOffline ? "--" : `${percentage}%`}
        </span>
        {!isXs && (
          <div className={cn(
            "tracking-wide",
            isDark ? "text-zinc-400" : "text-zinc-600",
            isCompact ? "text-xs mt-2" : "text-sm mt-3"
          )}>
            {details.map((detail, i) => (
              <div key={i}>{isOffline ? "--" : detail}</div>
            ))}
          </div>
        )}
        {history && (
          <div className={cn("mt-auto", isCompact ? "pt-2" : "pt-4")}>
            <Sparkline data={history} color={sparklineColor} height={isXs ? 40 : isCompact ? 50 : 60} isDark={isDark} />
          </div>
        )}
      </UsageCardContent>
    </UsageCard>
  );
}

// Size-aware System Information Card
function SystemInformationCard({ itemId }: { itemId: string }) {
  const { getItemSize } = useDragDropGrid();
  const { isDark } = useTheme();
  const size = getItemSize(itemId);

  const isXs = size === "xs";
  const isCompact = size === "xs" || size === "sm";
  const isLarge = size === "lg" || size === "xl";

  // Mock node data - would come from props/API in real app
  const nodeData = {
    id: "node-us-east-1a-7f3b",
    name: "Production Node 1",
    location: "US East (N. Virginia)",
    region: "us-east-1",
    zone: "us-east-1a",
    provider: "AWS",
  };

  const labelColor = isDark ? "text-zinc-500" : "text-zinc-500";
  const valueColor = isDark ? "text-zinc-200" : "text-zinc-800";

  return (
    <UsageCard isDark={isDark} className={cn("h-full", isXs && "p-4")}>
      <UsageCardTitle isDark={isDark} className={cn(
        "opacity-80",
        isXs ? "text-xs mb-2" : isCompact ? "text-xs mb-4" : "text-md"
      )}>
        {isXs ? "NODE" : "SYSTEM INFORMATION"}
      </UsageCardTitle>
      <UsageCardContent className={isXs ? "space-y-1" : undefined}>
        <div className={cn(
          isXs ? "space-y-1 text-[10px]" : isCompact ? "space-y-2 text-xs" : "space-y-3 text-sm"
        )}>
          <div>
            <div className={cn(labelColor, "mb-0.5", isXs ? "text-[9px]" : "text-xs")}>NAME</div>
            <div className={cn(valueColor, isXs && "text-[10px]")}>{isXs ? "Prod Node 1" : nodeData.name}</div>
          </div>
          <div>
            <div className={cn(labelColor, "mb-0.5", isXs ? "text-[9px]" : "text-xs")}>{isXs ? "ID" : "NODE ID"}</div>
            <div className={cn(valueColor, "font-mono", isXs && "text-[10px]")}>{isXs ? "7f3b" : nodeData.id}</div>
          </div>
          <div>
            <div className={cn(labelColor, "mb-0.5", isXs ? "text-[9px]" : "text-xs")}>LOCATION</div>
            <div className={cn(valueColor, isXs && "text-[10px]")}>{isXs ? "US East" : nodeData.location}</div>
          </div>
          {!isXs && !isCompact && (
            <div>
              <div className={cn(labelColor, "text-xs mb-0.5")}>REGION / ZONE</div>
              <div className={cn(valueColor, "font-mono")}>{nodeData.region} / {nodeData.zone}</div>
            </div>
          )}
          {isLarge && (
            <div>
              <div className={cn(labelColor, "text-xs mb-0.5")}>PROVIDER</div>
              <div className={valueColor}>{nodeData.provider}</div>
            </div>
          )}
        </div>
      </UsageCardContent>
    </UsageCard>
  );
}

// Size-aware Network Info Card
function NetworkInfoCard({ itemId }: { itemId: string }) {
  const { getItemSize } = useDragDropGrid();
  const { isDark } = useTheme();
  const size = getItemSize(itemId);

  const isXs = size === "xs";
  const isCompact = size === "xs" || size === "sm";
  const isLarge = size === "lg" || size === "xl";

  const labelColor = isDark ? "text-zinc-500" : "text-zinc-500";
  const valueColor = isDark ? "text-zinc-200" : "text-zinc-800";
  const badgeBg = isDark ? "bg-zinc-800 text-zinc-300" : "bg-zinc-200 text-zinc-700";

  return (
    <UsageCard isDark={isDark} className={cn("h-full", isXs && "p-4")}>
      <UsageCardTitle isDark={isDark} className={cn(
        "opacity-80",
        isXs ? "text-xs mb-2" : isCompact ? "text-xs mb-4" : "text-md"
      )}>
        {isXs ? "NETWORK" : "NETWORK INFO"}
      </UsageCardTitle>
      <UsageCardContent className={isXs ? "space-y-1" : undefined}>
        <div className={cn(
          isXs ? "space-y-1 text-[10px]" : isCompact ? "space-y-2 text-xs" : "space-y-3 text-sm"
        )}>
          <div>
            <div className={cn(labelColor, "mb-0.5", isXs ? "text-[9px]" : "text-xs")}>{isXs ? "IP" : "PUBLIC IP"}</div>
            <div className={cn(valueColor, "font-mono", isXs && "text-[10px]")}>203.45.167.89</div>
          </div>
          {!isXs && !isCompact && (
            <div>
              <div className={cn(labelColor, "text-xs mb-0.5")}>PRIVATE IP</div>
              <div className={cn(valueColor, "font-mono")}>192.168.1.100</div>
            </div>
          )}
          {!isXs && (
            <div>
              <div className={cn(labelColor, "text-xs mb-0.5")}>OPEN PORTS</div>
              <div className={cn(
                "flex flex-wrap gap-1 mt-1",
                isLarge && "gap-2"
              )}>
                <span className={cn("px-2 py-0.5 rounded text-xs", badgeBg)}>22 SSH</span>
                <span className={cn("px-2 py-0.5 rounded text-xs", badgeBg)}>80 HTTP</span>
                <span className={cn("px-2 py-0.5 rounded text-xs", badgeBg)}>443 HTTPS</span>
                {isLarge && (
                  <>
                    <span className={cn("px-2 py-0.5 rounded text-xs", badgeBg)}>3306 MySQL</span>
                    <span className={cn("px-2 py-0.5 rounded text-xs", badgeBg)}>5432 PostgreSQL</span>
                  </>
                )}
              </div>
            </div>
          )}
          {isXs && (
            <div>
              <div className={cn(labelColor, "text-[9px] mb-0.5")}>PORTS</div>
              <div className={cn(valueColor, "font-mono text-[10px]")}>22, 80, 443</div>
            </div>
          )}
          {isLarge && (
            <div>
              <div className={cn(labelColor, "text-xs mb-0.5")}>MAC ADDRESS</div>
              <div className={cn(valueColor, "font-mono")}>00:1A:2B:3C:4D:5E</div>
            </div>
          )}
        </div>
      </UsageCardContent>
    </UsageCard>
  );
}

// Size-aware Network Usage Card with dual bars
interface NetworkUsageCardProps {
  itemId: string;
  download: number; // MB/s
  upload: number; // MB/s
  downloadHistory?: number[];
  uploadHistory?: number[];
}

function NetworkUsageCard({ itemId, download, upload, downloadHistory, uploadHistory }: NetworkUsageCardProps) {
  const { getItemSize, isEditing } = useDragDropGrid();
  const { isDark } = useTheme();
  const isOffline = useServerStore((state) => state.isOffline);
  const size = getItemSize(itemId);

  const isXxs = size === "xxs" || size === "xxs-wide";
  const isXs = size === "xs";
  const isCompact = size === "xs" || size === "sm" || size === "xxs" || size === "xxs-wide";

  const valueColor = isOffline ? (isDark ? "text-zinc-500" : "text-zinc-400") : (isDark ? "text-zinc-200" : "text-zinc-800");
  const offlineGray = isDark ? "#71717a" : "#a1a1aa";

  // xxs view: minimal horizontal layout with just upload/download speeds
  if (isXxs) {
    return (
      <UsageCard isDark={isDark} className={cn("h-full flex items-center justify-between px-6", isOffline && "opacity-60")}>
        <span className={cn("font-mono text-sm", isOffline ? (isDark ? "text-zinc-500" : "text-zinc-400") : "text-blue-400")}>
          ↓ {isOffline ? "-- " : download} MB/s
        </span>
        <span className={cn("font-mono text-sm", isOffline ? (isDark ? "text-zinc-500" : "text-zinc-400") : "text-purple-400")}>
          ↑ {isOffline ? "-- " : upload} MB/s
        </span>
      </UsageCard>
    );
  }

  return (
    <UsageCard isDark={isDark} className={cn("h-full", isXs && "p-4", isOffline && "opacity-60")}>
      <InfoTooltip
        visible={!isEditing}
        isDark={isDark}
        content={
          <>
            <InfoRow label="Interface" value="Ethernet" isDark={isDark} />
            <InfoRow label="Adapter" value="Intel I226-V" isDark={isDark} />
            <InfoRow label="Speed" value="2.5 Gbps" isDark={isDark} />
            <InfoRow label="IPv4" value="192.168.1.100" isDark={isDark} />
            <InfoRow label="Gateway" value="192.168.1.1" isDark={isDark} />
            <InfoRow label="DNS" value="1.1.1.1" isDark={isDark} />
          </>
        }
      />
      <UsageCardTitle isDark={isDark} className={cn(
        "opacity-80",
        isXs ? "text-xs mb-2" : isCompact ? "text-xs mb-4" : "text-md"
      )}>
        NETWORK
      </UsageCardTitle>
      <UsageCardContent className={isXs ? "space-y-1" : undefined}>
        <div className={cn(
          "tracking-wide",
          isDark ? "text-zinc-400" : "text-zinc-600",
          isXs ? "text-[10px]" : isCompact ? "text-xs" : "text-sm"
        )}>
          <div className="flex justify-between items-center">
            <span className={isOffline ? (isDark ? "text-zinc-500" : "text-zinc-400") : "text-blue-400"}>{isXs ? "↓" : "↓ Download"}</span>
            <span className={cn(valueColor, "font-mono")}>{isOffline ? "--" : download} MB/s</span>
          </div>
          <div className="flex justify-between items-center mt-0.5">
            <span className={isOffline ? (isDark ? "text-zinc-500" : "text-zinc-400") : "text-purple-400"}>{isXs ? "↑" : "↑ Upload"}</span>
            <span className={cn(valueColor, "font-mono")}>{isOffline ? "--" : upload} MB/s</span>
          </div>
        </div>
        {downloadHistory && uploadHistory && (
          <div className={cn("mt-auto", isCompact ? "pt-2" : "pt-4")}>
            <DualSparkline
              data1={downloadHistory}
              data2={uploadHistory}
              color1={isOffline ? offlineGray : "#3b82f6"}
              color2={isOffline ? offlineGray : "#a855f7"}
              height={isXs ? 40 : isCompact ? 50 : 60}
              isDark={isDark}
            />
          </div>
        )}
      </UsageCardContent>
    </UsageCard>
  );
}

// Instance Name Card
function InstanceNameCard({ itemId }: { itemId: string }) {
  const { isDark } = useTheme();
  const instanceName = useServerStore((state) => state.server.name);

  return (
    <UsageCard isDark={isDark} className="h-full flex items-center justify-center">
      <div className={cn("text-2xl font-mono uppercase", isDark ? "text-zinc-400" : "text-zinc-600")}>
        {instanceName}
      </div>
    </UsageCard>
  );
}

// Card Preview component for the management sheet
interface CardPreviewProps {
  cardId: string;
  isDark: boolean;
}

function CardPreview({ cardId, isDark }: CardPreviewProps) {
  const server = useServerStore((state) => state.server);
  const valueColor = isDark ? "text-zinc-200" : "text-zinc-800";
  const badgeBg = isDark ? "bg-zinc-800 text-zinc-300" : "bg-zinc-200 text-zinc-700";

  switch (cardId) {
    case "instance-name":
      return (
        <UsageCard isDark={isDark} className="h-full flex items-center justify-center">
          <div className={cn("text-lg font-mono uppercase", isDark ? "text-zinc-400" : "text-zinc-600")}>
            {server.name}
          </div>
        </UsageCard>
      );

    case "container-controls":
      return (
        <UsageCard isDark={isDark} className="h-full flex items-center justify-center px-4">
          <div className="flex gap-2 w-full justify-center">
            {["Start", "Stop", "Kill", "Restart"].map((label) => (
              <span
                key={label}
                className={cn(
                  "px-2 py-1 rounded text-[10px] font-medium uppercase",
                  isDark ? "bg-zinc-800 text-zinc-400" : "bg-zinc-200 text-zinc-600"
                )}
              >
                {label}
              </span>
            ))}
          </div>
        </UsageCard>
      );

    case "system-info":
      return (
        <UsageCard isDark={isDark} className="h-full p-3">
          <div className={cn("text-[10px] uppercase mb-2", isDark ? "text-zinc-400" : "text-zinc-600")}>
            System Info
          </div>
          <div className="space-y-1 text-[10px]">
            <div className={valueColor}>{server.system.os}</div>
            <div className={cn("font-mono", valueColor)}>{server.system.osVersion}</div>
          </div>
        </UsageCard>
      );

    case "network-info":
      return (
        <UsageCard isDark={isDark} className="h-full p-3">
          <div className={cn("text-[10px] uppercase mb-2", isDark ? "text-zinc-400" : "text-zinc-600")}>
            Network Info
          </div>
          <div className="space-y-1 text-[10px]">
            <div className={cn("font-mono", valueColor)}>{server.networkConfig.ipAddress}</div>
            <div className="flex gap-1 mt-1">
              <span className={cn("px-1 py-0.5 rounded text-[8px]", badgeBg)}>{server.networkConfig.port}</span>
            </div>
          </div>
        </UsageCard>
      );

    case "cpu":
      return (
        <UsageCard isDark={isDark} className="h-full p-3">
          <div className={cn("text-[10px] uppercase mb-1", isDark ? "text-zinc-400" : "text-zinc-600")}>
            CPU
          </div>
          <div className={cn("text-xl font-mono", isDark ? "text-zinc-100" : "text-zinc-800")}>
            {server.cpu.usage.percentage}%
          </div>
          <div className="mt-2">
            <Sparkline data={server.cpu.usage.history} color={getUsageColor(server.cpu.usage.percentage, isDark)} height={30} isDark={isDark} />
          </div>
        </UsageCard>
      );

    case "ram":
      return (
        <UsageCard isDark={isDark} className="h-full p-3">
          <div className={cn("text-[10px] uppercase mb-1", isDark ? "text-zinc-400" : "text-zinc-600")}>
            RAM
          </div>
          <div className={cn("text-xl font-mono", isDark ? "text-zinc-100" : "text-zinc-800")}>
            {server.memory.usage.percentage}%
          </div>
          <div className="mt-2">
            <Sparkline data={server.memory.usage.history} color={getUsageColor(server.memory.usage.percentage, isDark)} height={30} isDark={isDark} />
          </div>
        </UsageCard>
      );

    case "disk":
      return (
        <UsageCard isDark={isDark} className="h-full p-3">
          <div className={cn("text-[10px] uppercase mb-1", isDark ? "text-zinc-400" : "text-zinc-600")}>
            DISK
          </div>
          <div className={cn("text-xl font-mono", isDark ? "text-zinc-100" : "text-zinc-800")}>
            {server.disk.usage.percentage}%
          </div>
          <div className="mt-2">
            <Sparkline data={server.disk.usage.history} color={getUsageColor(server.disk.usage.percentage, isDark)} height={30} isDark={isDark} />
          </div>
        </UsageCard>
      );

    case "network-usage":
      return (
        <UsageCard isDark={isDark} className="h-full p-3">
          <div className={cn("text-[10px] uppercase mb-1", isDark ? "text-zinc-400" : "text-zinc-600")}>
            Network
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-blue-400">↓ {server.network.download}</span>
            <span className="text-purple-400">↑ {server.network.upload}</span>
          </div>
          <div className="mt-2">
            <DualSparkline
              data1={server.network.downloadHistory}
              data2={server.network.uploadHistory}
              color1="#3b82f6"
              color2="#a855f7"
              height={30}
              isDark={isDark}
            />
          </div>
        </UsageCard>
      );

    default:
      return (
        <UsageCard isDark={isDark} className="h-full flex items-center justify-center">
          <div className={cn("text-sm", isDark ? "text-zinc-400" : "text-zinc-600")}>
            {cardMetadata[cardId]?.name || cardId}
          </div>
        </UsageCard>
      );
  }
}

// Container Controls Card
function ContainerControlsCard({ itemId }: { itemId: string }) {
  const { isDark } = useTheme();
  const isOffline = useServerStore((state) => state.isOffline);
  const status = useServerStore((state) => state.server.status);
  const setContainerStatus = useServerStore((state) => state.setContainerStatus);

  const handleStart = () => {
    if (isOffline) {
      toast.error("Cannot start server while offline");
      return;
    }
    setContainerStatus("starting");
    const toastId = toast.loading("Starting server...");
    setTimeout(() => {
      setContainerStatus("running");
      toast.dismiss(toastId);
      toast.success("Server started successfully");
    }, 1500);
  };

  const handleStop = () => {
    if (isOffline) {
      toast.error("Cannot stop server while offline");
      return;
    }
    setContainerStatus("stopping");
    const toastId = toast.loading("Stopping server...");
    setTimeout(() => {
      setContainerStatus("stopped");
      toast.dismiss(toastId);
      toast.info("Server stopped");
    }, 1500);
  };

  const handleKill = () => {
    if (isOffline) {
      toast.error("Cannot kill server while offline");
      return;
    }
    setContainerStatus("stopped");
    toast.warning("Server force killed");
  };

  const handleRestart = () => {
    if (isOffline) {
      toast.error("Cannot restart server while offline");
      return;
    }
    setContainerStatus("stopping");
    const toastId = toast.loading("Restarting server...");
    setTimeout(() => {
      setContainerStatus("starting");
      setTimeout(() => {
        setContainerStatus("running");
        toast.dismiss(toastId);
        toast.success("Server restarted successfully");
      }, 1000);
    }, 1000);
  };

  const isRunning = status === "running";
  const isStopped = status === "stopped";
  const isTransitioning = status === "starting" || status === "stopping";

  const buttonBase = "px-4 py-2 text-xs font-medium uppercase tracking-wider transition-colors";
  const buttonColors = isDark
    ? "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
    : "bg-zinc-200 text-zinc-700 hover:bg-zinc-300";
  const disabledColors = isDark
    ? "bg-zinc-800/50 text-zinc-600"
    : "bg-zinc-200/50 text-zinc-400";

  return (
    <UsageCard isDark={isDark} className={cn("h-full flex items-center justify-center px-8", isOffline && "opacity-60")}>
      <div className="flex gap-4 w-full justify-between max-w-md">
        <button
          onClick={handleStart}
          disabled={isRunning || isTransitioning || isOffline}
          className={cn(
            buttonBase,
            (isRunning || isTransitioning || isOffline) ? disabledColors : buttonColors,
            (isRunning || isTransitioning || isOffline) && "cursor-not-allowed"
          )}
        >
          Start
        </button>
        <button
          onClick={handleStop}
          disabled={isStopped || isTransitioning || isOffline}
          className={cn(
            buttonBase,
            (isStopped || isTransitioning || isOffline) ? disabledColors : buttonColors,
            (isStopped || isTransitioning || isOffline) && "cursor-not-allowed"
          )}
        >
          Stop
        </button>
        <button
          onClick={handleKill}
          disabled={isStopped || isOffline}
          className={cn(
            buttonBase,
            (isStopped || isOffline) ? disabledColors : buttonColors,
            (isStopped || isOffline) && "cursor-not-allowed"
          )}
        >
          Kill
        </button>
        <button
          onClick={handleRestart}
          disabled={isStopped || isTransitioning || isOffline}
          className={cn(
            buttonBase,
            (isStopped || isTransitioning || isOffline) ? disabledColors : buttonColors,
            (isStopped || isTransitioning || isOffline) && "cursor-not-allowed"
          )}
        >
          Restart
        </button>
      </div>
    </UsageCard>
  );
}
