"use client";

import { useState, useRef, useEffect, useCallback, createContext, useContext } from "react";
import { UsageCard, UsageCardContent, UsageCardTitle } from "@workspace/ui/components/shared/UsageCard/UsageCard";
import { DragDropGrid, GridItem, useDragDropGrid, type GridItemConfig } from "@workspace/ui/components/shared/DragDropGrid";
import { useGridStorage } from "@workspace/ui/hooks/useGridStorage";
import { InfoTooltip, InfoRow } from "@workspace/ui/components/shared/InfoTooltip";
import { Console, generateInitialLines, generateRandomLine, type ConsoleLine } from "@workspace/ui/components/shared/Console";
import { Button } from "@workspace/ui/components/button";
import { Spinner } from "@workspace/ui/components/spinner";
import { cn } from "@workspace/ui/lib/utils";
import { BsSun, BsMoon } from "react-icons/bs";
import { Sparkline, DualSparkline } from "@workspace/ui/components/shared/Sparkline";
import { AnimatedBackground } from "@workspace/ui/components/shared/AnimatedBackground";

// Theme context
const ThemeContext = createContext<{ isDark: boolean }>({ isDark: true });
const useTheme = () => useContext(ThemeContext);

// Simulated usage data with realistic fluctuations
interface UsageData {
  cpu: { percentage: number; cores: number; frequency: number; history: number[] };
  ram: { percentage: number; used: number; total: number; history: number[] };
  disk: { percentage: number; used: number; total: number; history: number[] };
  network: { percentage: number; download: number; upload: number; downloadHistory: number[]; uploadHistory: number[] };
}

const HISTORY_LENGTH = 20;

function useSimulatedUsage(): UsageData {
  const [data, setData] = useState<UsageData>(() => {
    // Generate initial history with realistic wave-like patterns
    const generateHistory = (base: number, volatility: number, min: number = 0, max: number = 100) => {
      const history: number[] = [];
      let current = base;
      for (let i = 0; i < HISTORY_LENGTH; i++) {
        // Add sine wave pattern + random noise for more realistic variation
        const wave = Math.sin(i * 0.5) * volatility * 0.3;
        const noise = (Math.random() - 0.5) * volatility;
        const spike = Math.random() < 0.1 ? (Math.random() - 0.3) * volatility * 2 : 0;
        current = Math.max(min, Math.min(max, current + wave + noise + spike));
        history.push(Math.round(current));
      }
      return history;
    };

    return {
      cpu: { percentage: 42, cores: 8, frequency: 3.2, history: generateHistory(42, 20, 5, 95) },
      ram: { percentage: 67, used: 10.7, total: 16, history: generateHistory(67, 15, 30, 95) },
      disk: { percentage: 54, used: 432, total: 800, history: generateHistory(54, 5, 50, 60) },
      network: {
        percentage: 23,
        download: 45,
        upload: 12,
        downloadHistory: generateHistory(45, 30, 10, 100),
        uploadHistory: generateHistory(20, 20, 5, 50),
      },
    };
  });

  useEffect(() => {
    const interval = setInterval(() => {
      setData((prev) => {
        // Helper to add random variation with occasional spikes
        const vary = (current: number, min: number, max: number, volatility: number = 5) => {
          const spike = Math.random() < 0.05; // 5% chance of spike
          const change = spike
            ? (Math.random() - 0.3) * volatility * 4 // Larger change for spikes (biased up)
            : (Math.random() - 0.5) * volatility;
          return Math.min(max, Math.max(min, current + change));
        };

        const newCpu = vary(prev.cpu.percentage, 5, 95, 8);
        const newRam = vary(prev.ram.percentage, 30, 95, 3);
        const newDisk = vary(prev.disk.percentage, 50, 60, 0.5); // Disk changes slowly
        const newNetwork = vary(prev.network.percentage, 5, 80, 10);
        const newDownload = Math.round(10 + (newNetwork / 100) * 90);
        const newUpload = Math.round(5 + (newNetwork / 100) * 30);

        return {
          cpu: {
            ...prev.cpu,
            percentage: Math.round(newCpu),
            frequency: +(3.0 + (newCpu / 100) * 1.2).toFixed(1),
            history: [...prev.cpu.history.slice(1), Math.round(newCpu)],
          },
          ram: {
            ...prev.ram,
            percentage: Math.round(newRam),
            used: +((newRam / 100) * prev.ram.total).toFixed(1),
            history: [...prev.ram.history.slice(1), Math.round(newRam)],
          },
          disk: {
            ...prev.disk,
            percentage: Math.round(newDisk),
            used: Math.round((newDisk / 100) * prev.disk.total),
            history: [...prev.disk.history.slice(1), Math.round(newDisk)],
          },
          network: {
            ...prev.network,
            percentage: Math.round(newNetwork),
            download: newDownload,
            upload: newUpload,
            downloadHistory: [...prev.network.downloadHistory.slice(1), newDownload],
            uploadHistory: [...prev.network.uploadHistory.slice(1), newUpload],
          },
        };
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  return data;
}

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
  { i: "console", size: "xl", minSize: "md", maxSize: "xl" },
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

  useEffect(() => {
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
  }, []);

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
  const { items, layouts, isLoaded, saveLayout, resetLayout } = useGridStorage({
    key: "stellarstack-dashboard-layout",
    defaultItems: defaultGridItems,
  });
  const usage = useSimulatedUsage();
  const { lines: consoleLines, handleCommand } = useSimulatedConsole();

  // Show spinner while loading from localStorage
  if (!isLoaded) {
    return <DashboardLoading />;
  }

  return (
    <ThemeContext.Provider value={{ isDark }}>
    <div className={cn(
      "min-h-svh p-8 transition-colors relative",
      isDark ? "bg-[#0b0b0a]" : "bg-[#f5f5f4]"
    )}>
      <AnimatedBackground isDark={isDark} />
      {/* Header with Edit Toggle */}
      <div className="mx-auto mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-zinc-100"></h1>
        <div className="flex items-center gap-2">
          {isEditing && (
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

      <DragDropGrid
        className="max-w-7xl mx-auto"
        items={items}
        savedLayouts={layouts}
        onLayoutChange={saveLayout}
        rowHeight={50}
        gap={16}
        isEditing={isEditing}
        isDark={isDark}
      >
        {/* Instance Name */}
        <div key="instance-name" className="h-full">
          <GridItem itemId="instance-name">
            <InstanceNameCard itemId="instance-name" />
          </GridItem>
        </div>

        {/* Container Controls */}
        <div key="container-controls" className="h-full">
          <GridItem itemId="container-controls">
            <ContainerControlsCard itemId="container-controls" />
          </GridItem>
        </div>

        {/* System Information */}
        <div key="system-info" className="h-full">
          <GridItem itemId="system-info">
            <SystemInformationCard itemId="system-info" />
          </GridItem>
        </div>

        {/* Network Info */}
        <div key="network-info" className="h-full">
          <GridItem itemId="network-info">
            <NetworkInfoCard itemId="network-info" />
          </GridItem>
        </div>

        {/* CPU Usage */}
        <div key="cpu" className="h-full">
          <GridItem itemId="cpu">
            <UsageMetricCard
              itemId="cpu"
              title="CPU"
              percentage={usage.cpu.percentage}
              details={[`${usage.cpu.cores} CORES`, `${usage.cpu.frequency} GHz`]}
              history={usage.cpu.history}
              tooltipContent={
                <>
                  <InfoRow label="Model" value="AMD Ryzen 9 9950X3D" isDark={isDark} />
                  <InfoRow label="Architecture" value="Zen 5" isDark={isDark} />
                  <InfoRow label="Base Clock" value="4.3 GHz" isDark={isDark} />
                  <InfoRow label="Boost Clock" value="5.7 GHz" isDark={isDark} />
                  <InfoRow label="TDP" value="170W" isDark={isDark} />
                  <InfoRow label="Cache" value="144MB" isDark={isDark} />
                </>
              }
            />
          </GridItem>
        </div>

        {/* RAM Usage */}
        <div key="ram" className="h-full">
          <GridItem itemId="ram">
            <UsageMetricCard
              itemId="ram"
              title="RAM"
              percentage={usage.ram.percentage}
              details={[`${usage.ram.used} / ${usage.ram.total} GB`, "USED"]}
              history={usage.ram.history}
              tooltipContent={
                <>
                  <InfoRow label="Type" value="DDR5" isDark={isDark} />
                  <InfoRow label="Speed" value="6000 MT/s" isDark={isDark} />
                  <InfoRow label="Channels" value="Dual Channel" isDark={isDark} />
                  <InfoRow label="Slots Used" value="2 / 4" isDark={isDark} />
                  <InfoRow label="Timings" value="CL30-38-38" isDark={isDark} />
                </>
              }
            />
          </GridItem>
        </div>

        {/* Disk Usage */}
        <div key="disk" className="h-full">
          <GridItem itemId="disk">
            <UsageMetricCard
              itemId="disk"
              title="DISK"
              percentage={usage.disk.percentage}
              details={[`${usage.disk.used} / ${usage.disk.total} GB`, "NVMe SSD"]}
              history={usage.disk.history}
              tooltipContent={
                <>
                  <InfoRow label="Model" value="Samsung 990 Pro" isDark={isDark} />
                  <InfoRow label="Interface" value="PCIe 4.0 x4" isDark={isDark} />
                  <InfoRow label="Read Speed" value="7,450 MB/s" isDark={isDark} />
                  <InfoRow label="Write Speed" value="6,900 MB/s" isDark={isDark} />
                  <InfoRow label="Health" value="98%" isDark={isDark} />
                </>
              }
            />
          </GridItem>
        </div>

        {/* Network Usage */}
        <div key="network-usage" className="h-full">
          <GridItem itemId="network-usage">
            <NetworkUsageCard
              itemId="network-usage"
              download={usage.network.download}
              upload={usage.network.upload}
              downloadHistory={usage.network.downloadHistory}
              uploadHistory={usage.network.uploadHistory}
            />
          </GridItem>
        </div>

        {/* Console */}
        <div key="console" className="h-full">
          <GridItem itemId="console">
            <Console lines={consoleLines} onCommand={handleCommand} isDark={isDark} />
          </GridItem>
        </div>
      </DragDropGrid>

      {/* Footer */}
      <footer className={cn(
        "mt-12 pb-4 text-center text-sm uppercase transition-colors",
        isDark ? "text-zinc-500" : "text-zinc-600"
      )}>
        &copy; {new Date().getFullYear()} StellarStack
      </footer>
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
function getUsageColor(percentage: number): string {
  if (percentage > 75) return "#ef4444"; // red
  if (percentage > 50) return "#f59e0b"; // amber
  return "#22c55e"; // green
}

function UsageMetricCard({ itemId, title, percentage, details, tooltipContent, history, color }: UsageMetricCardProps) {
  const { getItemSize, isEditing } = useDragDropGrid();
  const { isDark } = useTheme();
  const size = getItemSize(itemId);

  // Determine layout based on size
  const isXxs = size === "xxs" || size === "xxs-wide";
  const isXs = size === "xs";
  const isSm = size === "sm";
  const isMd = size === "md";
  const isCompact = size === "xs" || size === "sm" || size === "xxs" || size === "xxs-wide";
  const isLarge = size === "lg" || size === "xl";
  const showSparklineOnly = isSm || isMd || isLarge; // On SM, MD, LG, XL show sparkline instead of bar

  const sparklineColor = color || getUsageColor(percentage);

  // xxs/xxs-wide view: minimal horizontal layout with just title and percentage
  if (isXxs) {
    return (
      <UsageCard isDark={isDark} className="h-full flex items-center justify-between px-6">
        <span className={cn("text-xs font-medium uppercase", isDark ? "text-zinc-400" : "text-zinc-600")}>{title}</span>
        <span className={cn("text-xl font-mono", isDark ? "text-zinc-100" : "text-zinc-800")}>{percentage}%</span>
      </UsageCard>
    );
  }

  return (
    <UsageCard isDark={isDark} className={cn("h-full", isXs && "p-4")}>
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
          isDark ? "text-zinc-100" : "text-zinc-800",
          isXs ? "text-xl" : isCompact ? "text-2xl" : isLarge ? "text-5xl" : "text-4xl"
        )}>
          {percentage}%
        </span>
        {!isXs && (
          <div className={cn(
            "tracking-wide",
            isDark ? "text-zinc-400" : "text-zinc-600",
            isCompact ? "text-xs mt-2" : "text-sm mt-3"
          )}>
            {details.map((detail, i) => (
              <div key={i}>{detail}</div>
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
  const size = getItemSize(itemId);

  const isXxs = size === "xxs" || size === "xxs-wide";
  const isXs = size === "xs";
  const isCompact = size === "xs" || size === "sm" || size === "xxs" || size === "xxs-wide";

  const valueColor = isDark ? "text-zinc-200" : "text-zinc-800";

  // xxs view: minimal horizontal layout with just upload/download speeds
  if (isXxs) {
    return (
      <UsageCard isDark={isDark} className="h-full flex items-center justify-between px-6">
        <span className="text-blue-400 font-mono text-sm">↓ {download} MB/s</span>
        <span className="text-purple-400 font-mono text-sm">↑ {upload} MB/s</span>
      </UsageCard>
    );
  }

  return (
    <UsageCard isDark={isDark} className={cn("h-full", isXs && "p-4")}>
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
            <span className="text-blue-400">{isXs ? "↓" : "↓ Download"}</span>
            <span className={cn(valueColor, "font-mono")}>{download} MB/s</span>
          </div>
          <div className="flex justify-between items-center mt-0.5">
            <span className="text-purple-400">{isXs ? "↑" : "↑ Upload"}</span>
            <span className={cn(valueColor, "font-mono")}>{upload} MB/s</span>
          </div>
        </div>
        {downloadHistory && uploadHistory && (
          <div className={cn("mt-auto", isCompact ? "pt-2" : "pt-4")}>
            <DualSparkline
              data1={downloadHistory}
              data2={uploadHistory}
              color1="#3b82f6"
              color2="#a855f7"
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
  // Mock data - would come from props/API in real app
  const instanceName = "A Minecraft Server";

  return (
    <UsageCard isDark={isDark} className="h-full flex items-center justify-center">
      <div className={cn("text-2xl font-mono uppercase", isDark ? "text-zinc-400" : "text-zinc-600")}>
        {instanceName}
      </div>
    </UsageCard>
  );
}

// Container Controls Card
function ContainerControlsCard({ itemId }: { itemId: string }) {
  const { isDark } = useTheme();
  const [status, setStatus] = useState<"running" | "stopped" | "starting" | "stopping">("running");

  const handleStart = () => {
    setStatus("starting");
    setTimeout(() => setStatus("running"), 1500);
  };

  const handleStop = () => {
    setStatus("stopping");
    setTimeout(() => setStatus("stopped"), 1500);
  };

  const handleKill = () => {
    setStatus("stopped");
  };

  const handleRestart = () => {
    setStatus("stopping");
    setTimeout(() => {
      setStatus("starting");
      setTimeout(() => setStatus("running"), 1000);
    }, 1000);
  };

  const isRunning = status === "running";
  const isStopped = status === "stopped";
  const isTransitioning = status === "starting" || status === "stopping";

  const buttonBase = "px-4 py-2 rounded text-xs font-medium uppercase tracking-wider transition-colors";
  const buttonColors = isDark
    ? "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
    : "bg-zinc-200 text-zinc-700 hover:bg-zinc-300";

  return (
    <UsageCard isDark={isDark} className="h-full flex items-center justify-center px-8">
      <div className="flex gap-4 w-full justify-between max-w-md">
        <button
          onClick={handleStart}
          disabled={isRunning || isTransitioning}
          className={cn(
            buttonBase,
            buttonColors,
            (isRunning || isTransitioning) && "opacity-50 cursor-not-allowed"
          )}
        >
          Start
        </button>
        <button
          onClick={handleStop}
          disabled={isStopped || isTransitioning}
          className={cn(
            buttonBase,
            buttonColors,
            (isStopped || isTransitioning) && "opacity-50 cursor-not-allowed"
          )}
        >
          Stop
        </button>
        <button
          onClick={handleKill}
          disabled={isStopped}
          className={cn(
            buttonBase,
            buttonColors,
            isStopped && "opacity-50 cursor-not-allowed"
          )}
        >
          Kill
        </button>
        <button
          onClick={handleRestart}
          disabled={isStopped || isTransitioning}
          className={cn(
            buttonBase,
            buttonColors,
            (isStopped || isTransitioning) && "opacity-50 cursor-not-allowed"
          )}
        >
          Restart
        </button>
      </div>
    </UsageCard>
  );
}
