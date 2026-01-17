"use client";

import type { JSX } from "react";
import { cn } from "@workspace/ui/lib/utils";
import { AnimatedNumber } from "../animated-number";
import type { CpuCoreGridProps } from "../dashboard-cards-types";

export const CpuCoreGrid = ({ cores, isOffline }: CpuCoreGridProps): JSX.Element => {
  const getUsageColor = (percentage: number): string => {
    if (percentage === 0) return "#71717a";
    if (percentage > 75) return "#ef4444";
    if (percentage > 50) return "#f59e0b";
    return "#22c55e";
  };

  const coreCount = cores.length;
  const isCompact = coreCount > 16;

  return (
    <div className={cn(
      "flex-1 min-h-0 overflow-y-auto",
      "scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent"
    )}>
      <div
        className="grid gap-1"
        style={{
          gridTemplateColumns: "repeat(auto-fill, 50px)",
        }}
      >
        {cores.map((core) => {
          const color = isOffline ? "#71717a" : getUsageColor(core.percentage);
          return (
            <div
              key={core.id}
              className={cn(
                "relative transition-all border aspect-square",
                isCompact ? "p-1" : "p-2",
                "bg-zinc-900/50 border-zinc-800"
              )}
            >
              <div
                className="absolute inset-0 opacity-20 transition-all duration-300"
                style={{
                  background: `linear-gradient(to top, ${color} ${core.percentage}%, transparent ${core.percentage}%)`,
                }}
              />
              <div className="relative text-center h-full flex flex-col justify-center">
                <div className={cn(
                  "font-medium uppercase leading-none",
                  isCompact ? "text-[8px]" : "text-[10px]",
                  "text-zinc-500"
                )}>
                  {isCompact ? core.id : `C${core.id}`}
                </div>
                <div className={cn(
                  "font-mono tabular-nums leading-tight mt-1",
                  isCompact ? "text-[10px]" : "text-xs",
                  isOffline
                    ? "text-zinc-600"
                    : "text-zinc-200"
                )}>
                  {isOffline ? "--" : <AnimatedNumber value={core.percentage} suffix="%" willChange />}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
