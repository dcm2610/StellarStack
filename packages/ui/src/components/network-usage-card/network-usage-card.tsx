"use client";

import type { JSX } from "react";
import { cn } from "@workspace/ui/lib/utils";
import { UsageCard, UsageCardContent, UsageCardTitle } from "../usage-card";
import { InfoTooltip, InfoRow } from "../info-tooltip";
import { DualSparkline } from "../sparkline";
import { AnimatedNumber } from "../animated-number";
import { useDragDropGrid } from "../drag-drop-grid";
import type { NetworkUsageCardProps, NetworkTooltipData, NetworkUsageCardLabels } from "../dashboard-cards-types";

interface NetworkUsageCardComponentProps extends NetworkUsageCardProps {
  isOffline: boolean;
  tooltipData?: NetworkTooltipData;
  labels: NetworkUsageCardLabels;
}

export const NetworkUsageCard = ({
  itemId,
  download,
  upload,
  downloadHistory,
  uploadHistory,
  isOffline,
  tooltipData,
  labels,
}: NetworkUsageCardComponentProps): JSX.Element => {
  const { getItemSize, isEditing } = useDragDropGrid();
  const size = getItemSize(itemId);

  const isXxs = size === "xxs" || size === "xxs-wide";
  const isXs = size === "xs";
  const isCompact = size === "xs" || size === "sm" || size === "xxs" || size === "xxs-wide";

  const valueColor = isOffline ? "text-zinc-500" : "text-zinc-200";
  const offlineGray = "#71717a";

  if (isXxs) {
    return (
      <UsageCard className={cn("h-full flex items-center justify-between px-6", isOffline && "opacity-60")}>
        <span className={cn("font-mono text-sm", isOffline ? "text-zinc-500" : "text-blue-400")}>
          ↓ {isOffline ? "-- " : <AnimatedNumber value={download} decimals={1} />} MB/s
        </span>
        <span className={cn("font-mono text-sm", isOffline ? "text-zinc-500" : "text-purple-400")}>
          ↑ {isOffline ? "-- " : <AnimatedNumber value={upload} decimals={1} />} MB/s
        </span>
      </UsageCard>
    );
  }

  return (
    <UsageCard className={cn("h-full", isXs && "p-4", isOffline && "opacity-60")}>
      {tooltipData && (
        <InfoTooltip
          visible={!isEditing}
          content={
            <>
              <InfoRow label={labels.interface || "Interface"} value={tooltipData.interface} />
              <InfoRow label={labels.adapter || "Adapter"} value={tooltipData.adapter} />
              <InfoRow label={labels.speed || "Speed"} value={tooltipData.speed} />
              <InfoRow label={labels.ipv4 || "IPv4"} value={tooltipData.ipv4} />
              <InfoRow label={labels.gateway || "Gateway"} value={tooltipData.gateway} />
              <InfoRow label={labels.dns || "DNS"} value={tooltipData.dns} />
            </>
          }
        />
      )}
      <UsageCardTitle className={cn(
        "opacity-80",
        isXs ? "text-xs mb-2" : isCompact ? "text-xs mb-4" : "text-md"
      )}>
        {labels.title}
      </UsageCardTitle>
      <UsageCardContent className={isXs ? "space-y-1" : undefined}>
        <div className={cn(
          "tracking-wide text-zinc-400",
          isXs ? "text-[10px]" : isCompact ? "text-xs" : "text-sm"
        )}>
          <div className="flex justify-between items-center">
            <span className={isOffline ? "text-zinc-500" : "text-blue-400"}>{isXs ? "↓" : `↓ ${labels.download}`}</span>
            <span className={cn(valueColor, "font-mono")}>{isOffline ? "--" : <AnimatedNumber value={download} decimals={1} />} MB/s</span>
          </div>
          <div className="flex justify-between items-center mt-0.5">
            <span className={isOffline ? "text-zinc-500" : "text-purple-400"}>{isXs ? "↑" : `↑ ${labels.upload}`}</span>
            <span className={cn(valueColor, "font-mono")}>{isOffline ? "--" : <AnimatedNumber value={upload} decimals={1} />} MB/s</span>
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
            />
          </div>
        )}
      </UsageCardContent>
    </UsageCard>
  );
};
