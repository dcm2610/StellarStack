"use client";

import type { JSX } from "react";
import { cn } from "@workspace/ui/lib/utils";
import { UsageCard, UsageCardContent, UsageCardTitle } from "../usage-card";
import { InfoTooltip } from "../info-tooltip";
import { Sparkline } from "../sparkline";
import { AnimatedNumber } from "../animated-number";
import { useDragDropGrid } from "../drag-drop-grid";
import { CpuCoreGrid } from "../cpu-core-grid";
import { getUsageColor } from "../dashboard-cards-utils";
import type { CpuCardProps, CpuCardLabels } from "../dashboard-cards-types";

interface CpuCardComponentProps extends CpuCardProps {
  isOffline: boolean;
  labels: CpuCardLabels;
  /** Custom primary display value (e.g., "6% / 400%") - if provided, replaces percentage display */
  primaryValue?: string;
}

export const CpuCard = ({
  itemId,
  percentage,
  details,
  tooltipContent,
  history,
  coreUsage,
  isOffline,
  labels,
  primaryValue,
}: CpuCardComponentProps): JSX.Element => {
  const { getItemSize, isEditing } = useDragDropGrid();
  const size = getItemSize(itemId);

  const isXxs = size === "xxs" || size === "xxs-wide";
  const isXs = size === "xs";
  const isCompact = size === "xs" || size === "sm" || size === "xxs" || size === "xxs-wide";
  const isLarge = size === "lg" || size === "xl" || size === "xxl";
  const showCoreGrid = isLarge && coreUsage && coreUsage.length > 0;

  const sparklineColor = isOffline
    ? "#71717a"
    : getUsageColor(percentage);

  if (isXxs) {
    return (
      <UsageCard
        className={cn("flex h-full items-center justify-between px-6", isOffline && "opacity-60")}
      >
        <span
          className={cn(
            "text-xs font-medium uppercase",
            "text-zinc-400"
          )}
        >
          {labels.title}
        </span>
        <span
          className={cn(
            primaryValue ? "text-base" : "text-xl",
            "font-mono",
            isOffline
              ? "text-zinc-500"
              : "text-zinc-100"
          )}
        >
          {isOffline ? (
            "--"
          ) : primaryValue ? (
            primaryValue
          ) : (
            <AnimatedNumber value={percentage} suffix="%" />
          )}
        </span>
      </UsageCard>
    );
  }

  return (
    <UsageCard
      className={cn("flex h-full flex-col", isXs && "p-4", isOffline && "opacity-60")}
    >
      {tooltipContent && (
        <InfoTooltip content={tooltipContent} visible={!isEditing} />
      )}
      <UsageCardTitle
        className={cn("opacity-80", isXs ? "mb-2 text-xs" : isCompact ? "mb-4 text-xs" : "text-md")}
      >
        {labels.title}
      </UsageCardTitle>
      <UsageCardContent
        className={cn("flex min-h-0 flex-1 flex-col !space-y-0", isXs ? "gap-1" : undefined)}
      >
        <div className="flex shrink-0 items-start justify-between">
          <div>
            <span
              className={cn(
                isOffline
                  ? "text-zinc-500"
                  : "text-zinc-100",
                primaryValue
                  ? isXs
                    ? "text-lg"
                    : isCompact
                      ? "text-xl"
                      : showCoreGrid
                        ? "text-xl"
                        : isLarge
                          ? "text-3xl"
                          : "text-2xl"
                  : isXs
                    ? "text-xl"
                    : isCompact
                      ? "text-2xl"
                      : showCoreGrid
                        ? "text-2xl"
                        : isLarge
                          ? "text-5xl"
                          : "text-4xl"
              )}
            >
              {isOffline ? (
                "--"
              ) : primaryValue ? (
                primaryValue
              ) : (
                <AnimatedNumber value={percentage} suffix="%" />
              )}
            </span>
            {!isXs && !showCoreGrid && (
              <div
                className={cn(
                  "tracking-wide",
                  "text-zinc-400",
                  isCompact ? "mt-2 text-xs" : "mt-1 text-sm"
                )}
              >
                {details.map((detail, i) => (
                  <div key={i}>{isOffline ? "--" : detail}</div>
                ))}
              </div>
            )}
            {showCoreGrid && (
              <div
                className={cn(
                  "mt-0.5 text-[10px] tracking-wide",
                  "text-zinc-500"
                )}
              >
                {details[0]}
              </div>
            )}
          </div>
        </div>

        {showCoreGrid && coreUsage && (
          <div className="mt-2 flex min-h-0 flex-1 flex-col overflow-hidden">
            <div
              className={cn(
                "mb-1 shrink-0 text-[9px] font-medium uppercase",
                "text-zinc-500"
              )}
            >
              {labels.coreUsage}
            </div>
            <CpuCoreGrid cores={coreUsage} isOffline={isOffline} />
          </div>
        )}

        {history && !showCoreGrid && (
          <div className={cn("mt-auto", isCompact ? "pt-2" : "pt-4")}>
            <Sparkline
              data={history}
              color={sparklineColor}
              height={isXs ? 40 : isCompact ? 50 : 60}
            />
          </div>
        )}
      </UsageCardContent>
    </UsageCard>
  );
};
