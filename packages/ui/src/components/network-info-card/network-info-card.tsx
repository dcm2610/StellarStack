"use client";

import type { JSX } from "react";
import { cn } from "@workspace/ui/lib/utils";
import { UsageCard, UsageCardContent, UsageCardTitle } from "../usage-card";
import { useDragDropGrid } from "../drag-drop-grid";
import type { CardProps, NetworkInfoData, NetworkInfoCardLabels } from "../dashboard-cards-types";

interface NetworkInfoCardProps extends CardProps {
  networkInfo: NetworkInfoData;
  labels: NetworkInfoCardLabels;
}

export const NetworkInfoCard = ({ itemId, networkInfo, labels }: NetworkInfoCardProps): JSX.Element => {
  const { getItemSize } = useDragDropGrid();
  const size = getItemSize(itemId);

  const isXxs = size === "xxs" || size === "xxs-wide";
  const isXs = size === "xs";
  const isCompact = size === "xs" || size === "sm";
  const isLarge = size === "lg" || size === "xl";

  const labelColor = "text-zinc-500";
  const valueColor = "text-zinc-200";
  const badgeBg = "bg-zinc-800 text-zinc-300";

  const visiblePorts = isLarge ? networkInfo.openPorts : networkInfo.openPorts.slice(0, 3);
  const portsString = networkInfo.openPorts.slice(0, 3).map(p => p.port).join(", ");

  if (isXxs) {
    return (
      <UsageCard className="h-full flex items-center justify-between px-6">
        <span className={cn("text-xs font-medium uppercase", "text-zinc-400")}>{labels.titleShort}</span>
        <span className={cn("text-sm font-mono truncate ml-4", "text-zinc-100")}>{networkInfo.publicIp}</span>
      </UsageCard>
    );
  }

  return (
    <UsageCard className={cn("h-full", isXs && "p-4")}>
      <UsageCardTitle className={cn(
        "opacity-80",
        isXs ? "text-xs mb-2" : isCompact ? "text-xs mb-4" : "text-md"
      )}>
        {isXs ? labels.titleShort : labels.title}
      </UsageCardTitle>
      <UsageCardContent className={isXs ? "space-y-1" : undefined}>
        <div className={cn(
          isXs ? "space-y-1 text-[10px]" : isCompact ? "space-y-2 text-xs" : "space-y-3 text-sm"
        )}>
          <div>
            <div className={cn(labelColor, "mb-0.5", isXs ? "text-[9px]" : "text-xs")}>{isXs ? labels.publicIpShort : labels.publicIp}</div>
            <div className={cn(valueColor, "font-mono", isXs && "text-[10px]")}>{networkInfo.publicIp}</div>
          </div>
          {!isXs && !isCompact && networkInfo.privateIp && (
            <div>
              <div className={cn(labelColor, "text-xs mb-0.5")}>{labels.privateIp}</div>
              <div className={cn(valueColor, "font-mono")}>{networkInfo.privateIp}</div>
            </div>
          )}
          {!isXs && (
            <div>
              <div className={cn(labelColor, "text-xs mb-0.5")}>{labels.openPorts}</div>
              <div className={cn(
                "flex flex-wrap gap-1 mt-1",
                isLarge && "gap-2"
              )}>
                {visiblePorts.map((portInfo) => (
                  <span key={portInfo.port} className={cn("px-2 py-0.5 rounded text-xs", badgeBg)}>
                    {portInfo.port} {portInfo.protocol}
                  </span>
                ))}
              </div>
            </div>
          )}
          {isXs && (
            <div>
              <div className={cn(labelColor, "text-[9px] mb-0.5")}>{labels.portsShort}</div>
              <div className={cn(valueColor, "font-mono text-[10px]")}>{portsString}</div>
            </div>
          )}
          {isLarge && networkInfo.macAddress && (
            <div>
              <div className={cn(labelColor, "text-xs mb-0.5")}>{labels.macAddress}</div>
              <div className={cn(valueColor, "font-mono")}>{networkInfo.macAddress}</div>
            </div>
          )}
        </div>
      </UsageCardContent>
    </UsageCard>
  );
};
