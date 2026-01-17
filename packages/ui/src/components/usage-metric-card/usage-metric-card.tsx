"use client";

import type { JSX } from "react";
import { cn } from "@workspace/ui/lib/utils";
import { UsageCard, UsageCardContent, UsageCardTitle } from "../usage-card";
import { InfoTooltip } from "../info-tooltip";
import { Sparkline } from "../sparkline";
import { AnimatedNumber } from "../animated-number";
import { useDragDropGrid } from "../drag-drop-grid";
import { getUsageColor } from "../dashboard-cards-utils";
import type { UsageMetricCardProps, UsageMetricCardLabels } from "../dashboard-cards-types";

interface UsageMetricCardComponentProps extends UsageMetricCardProps {
  isOffline: boolean;
  labels: UsageMetricCardLabels;
  /** Custom primary display value (e.g., "0.01 GiB / 70 GiB") - if provided, replaces percentage display */
  primaryValue?: string;
}

export const UsageMetricCard = ({
  itemId,
  percentage,
  details,
  tooltipContent,
  history,
  color,
  isOffline,
  labels,
  primaryValue,
}: UsageMetricCardComponentProps): JSX.Element => {
  const { getItemSize, isEditing } = useDragDropGrid();
  const size = getItemSize(itemId);

  const isXxs = size === "xxs" || size === "xxs-wide";
  const isXs = size === "xs";
  const isCompact = size === "xs" || size === "sm" || size === "xxs" || size === "xxs-wide";
  const isLarge = size === "lg" || size === "xl";

  const sparklineColor = isOffline ? "#71717a" : (color || getUsageColor(percentage));

  if (isXxs) {
    return (
      <UsageCard className={cn("h-full flex items-center justify-between px-6", isOffline && "opacity-60")}>
        <span className={cn("text-xs font-medium uppercase", "text-zinc-400")}>{labels.title}</span>
        <span className={cn(primaryValue ? "text-base" : "text-xl", "font-mono", isOffline ? "text-zinc-500" : "text-zinc-100")}>
          {isOffline ? "--" : primaryValue ? primaryValue : <AnimatedNumber value={percentage} suffix="%" />}
        </span>
      </UsageCard>
    );
  }

  return (
    <UsageCard className={cn("h-full", isXs && "p-4", isOffline && "opacity-60")}>
      {tooltipContent && (
        <InfoTooltip content={tooltipContent} visible={!isEditing} />
      )}
      <UsageCardTitle className={cn(
        "opacity-80",
        isXs ? "text-xs mb-2" : isCompact ? "text-xs mb-4" : "text-md"
      )}>
        {labels.title}
      </UsageCardTitle>
      <UsageCardContent className={isXs ? "space-y-1" : undefined}>
        <span className={cn(
          isOffline ? "text-zinc-500" : "text-zinc-100",
          primaryValue
            ? (isXs ? "text-lg" : isCompact ? "text-xl" : isLarge ? "text-3xl" : "text-2xl")
            : (isXs ? "text-xl" : isCompact ? "text-2xl" : isLarge ? "text-5xl" : "text-4xl")
        )}>
          {isOffline ? "--" : primaryValue ? primaryValue : <AnimatedNumber value={percentage} suffix="%" />}
        </span>
        {!isXs && (
          <div className={cn(
            "tracking-wide",
            "text-zinc-400",
            isCompact ? "text-xs mt-2" : "text-sm mt-3"
          )}>
            {details.map((detail, i) => (
              <div key={i}>{isOffline ? "--" : detail}</div>
            ))}
          </div>
        )}
        {history && (
          <div className={cn("mt-auto", isCompact ? "pt-2" : "pt-4")}>
            <Sparkline data={history} color={sparklineColor} height={isXs ? 40 : isCompact ? 50 : 60} />
          </div>
        )}
      </UsageCardContent>
    </UsageCard>
  );
};
