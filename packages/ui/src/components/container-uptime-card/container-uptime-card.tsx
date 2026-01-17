"use client";

import type { JSX } from "react";
import { cn } from "@workspace/ui/lib/utils";
import { UsageCard, UsageCardContent, UsageCardTitle } from "../usage-card";
import { AnimatedNumber } from "../animated-number";
import { useDragDropGrid } from "../drag-drop-grid";
import { formatUptime } from "../dashboard-cards-utils";
import type { CardProps, ContainerStatus, ContainerUptimeCardLabels } from "../dashboard-cards-types";

interface ContainerUptimeCardProps extends CardProps {
  isOffline: boolean;
  containerUptime: number;
  containerStatus: ContainerStatus;
  labels: ContainerUptimeCardLabels;
}

export const ContainerUptimeCard = ({
  itemId,
  isOffline,
  containerUptime,
  containerStatus,
  labels,
}: ContainerUptimeCardProps): JSX.Element => {
  const { getItemSize } = useDragDropGrid();
  const size = getItemSize(itemId);

  const isXxs = size === "xxs" || size === "xxs-wide";
  const isXs = size === "xs";
  const isCompact = isXxs || isXs;

  const uptime = formatUptime(containerUptime);
  const isRunning = containerStatus === "running";

  if (isXxs) {
    return (
      <UsageCard className={cn("h-full flex items-center justify-between px-6", isOffline && "opacity-60")}>
        <span className={cn("text-xs font-medium uppercase", "text-zinc-400")}>{labels.titleShort}</span>
        <span className={cn("text-xl font-mono", "text-zinc-100")}>
          {isOffline || !isRunning ? "--" : uptime.full}
        </span>
      </UsageCard>
    );
  }

  return (
    <UsageCard className={cn("h-full", isXs && "p-4", isOffline && "opacity-60")}>
      <UsageCardTitle className={cn("opacity-80", isCompact ? "text-xs mb-2" : "text-md")}>
        {labels.title}
      </UsageCardTitle>
      <UsageCardContent className={isXs ? "space-y-1" : undefined}>
        <div className="flex items-baseline gap-2">
          <span className={cn(
            "text-zinc-100",
            isXs ? "text-2xl" : "text-4xl"
          )}>
            {isOffline || !isRunning ? "--" : <AnimatedNumber value={parseInt(uptime.value)} />}
          </span>
          <span className={cn(
            "uppercase",
            "text-zinc-500",
            isXs ? "text-xs" : "text-sm"
          )}>
            {isRunning ? uptime.unit : ""}
          </span>
        </div>
        {!isXs && (
          <div className={cn(
            "text-xs mt-2",
            "text-zinc-500"
          )}>
            {isRunning ? uptime.full : labels.containerStopped}
          </div>
        )}
      </UsageCardContent>
    </UsageCard>
  );
};
