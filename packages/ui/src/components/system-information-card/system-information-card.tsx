"use client";

import type { JSX } from "react";
import { cn } from "@workspace/ui/lib/utils";
import { UsageCard, UsageCardContent, UsageCardTitle } from "../usage-card";
import { useDragDropGrid } from "../drag-drop-grid";
import type { CardProps, NodeData, SystemInfoCardLabels } from "../dashboard-cards-types";

interface SystemInformationCardProps extends CardProps {
  nodeData: NodeData;
  labels: SystemInfoCardLabels;
}

export const SystemInformationCard = ({
  itemId,
  nodeData,
  labels,
}: SystemInformationCardProps): JSX.Element => {
  const { getItemSize } = useDragDropGrid();
  const size = getItemSize(itemId);

  const isXxs = size === "xxs" || size === "xxs-wide";
  const isXs = size === "xs";
  const isCompact = size === "xs" || size === "sm";
  const isLarge = size === "lg" || size === "xl";

  const labelColor = "text-zinc-500";
  const valueColor = "text-zinc-200";

  // Use shortId from nodeData if available, otherwise slice from full id
  const shortId = nodeData.shortId || nodeData.id.slice(-4);
  const shortLocation =
    nodeData.location.split(" ")[0] + " " + (nodeData.location.split(" ")[1] || "");

  if (isXxs) {
    return (
      <UsageCard className="flex h-full items-center justify-between px-6">
        <span
          className={cn(
            "text-xs font-medium uppercase",
            "text-zinc-400"
          )}
        >
          {labels.titleShort}
        </span>
        <span
          className={cn(
            "ml-4 truncate font-mono text-sm",
            "text-zinc-100"
          )}
        >
          {nodeData.name}
        </span>
      </UsageCard>
    );
  }

  return (
    <UsageCard className={cn("h-full", isXs && "p-4")}>
      <UsageCardTitle
        className={cn("opacity-80", isXs ? "mb-2 text-xs" : isCompact ? "mb-4 text-xs" : "text-md")}
      >
        {isXs ? labels.titleShort : labels.title}
      </UsageCardTitle>
      <UsageCardContent className={isXs ? "space-y-1" : undefined}>
        <div
          className={cn(
            isXs ? "space-y-1 text-[10px]" : isCompact ? "space-y-2 text-xs" : "space-y-3 text-sm"
          )}
        >
          <div>
            <div className={cn(labelColor, "mb-0.5", isXs ? "text-[9px]" : "text-xs")}>
              {labels.name}
            </div>
            <div className={cn(valueColor, isXs && "text-[10px]")}>{nodeData.name}</div>
          </div>
          <div>
            <div className={cn(labelColor, "mb-0.5", isXs ? "text-[9px]" : "text-xs")}>
              {isXs ? labels.nodeIdShort : labels.nodeId}
            </div>
            <div className={cn(valueColor, "font-mono", isXs && "text-[10px]")}>{shortId}</div>
          </div>
          <div>
            <div className={cn(labelColor, "mb-0.5", isXs ? "text-[9px]" : "text-xs")}>
              {labels.location}
            </div>
            <div className={cn(valueColor, isXs && "text-[10px]")}>
              {isXs ? shortLocation : nodeData.location}
            </div>
          </div>
          {!isXs && !isCompact && (
            <div>
              <div className={cn(labelColor, "mb-0.5 text-xs")}>{labels.regionZone}</div>
              <div className={cn(valueColor, "font-mono")}>
                {nodeData.region} / {nodeData.zone}
              </div>
            </div>
          )}
          {isLarge && (
            <div>
              <div className={cn(labelColor, "mb-0.5 text-xs")}>{labels.provider}</div>
              <div className={valueColor}>{nodeData.provider}</div>
            </div>
          )}
        </div>
      </UsageCardContent>
    </UsageCard>
  );
};
