"use client";

import type { JSX } from "react";
import { cn } from "../../../lib/utils";
import { AnimatedNumber } from "../Animations";
import type { CpuCoreGridProps } from "./types";

export const CpuCoreGrid = ({ cores, isDark, isOffline }: CpuCoreGridProps): JSX.Element => {
  const getUsageColor = (percentage: number): string => {
    if (percentage === 0) return isDark ? "#71717a" : "#a1a1aa";
    if (percentage > 75) return "#ef4444";
    if (percentage > 50) return "#f59e0b";
    return "#22c55e";
  };

  const coreCount = cores.length;
  const isCompact = coreCount > 16;

  return (
    <div className={cn(
      "flex-1 min-h-0 overflow-y-auto",
      isDark ? "scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent" : "scrollbar-thin scrollbar-thumb-zinc-400 scrollbar-track-transparent"
    )}>
      <div
        className="grid gap-1"
        style={{
          gridTemplateColumns: "repeat(auto-fill, 50px)",
        }}
      >
        {cores.map((core) => {
          const color = isOffline ? (isDark ? "#71717a" : "#a1a1aa") : getUsageColor(core.percentage);
          return (
            <div
              key={core.id}
              className={cn(
                "relative transition-all border aspect-square",
                isCompact ? "p-1" : "p-2",
                isDark
                  ? "bg-zinc-900/50 border-zinc-800"
                  : "bg-zinc-100/50 border-zinc-300"
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
                  isDark ? "text-zinc-500" : "text-zinc-600"
                )}>
                  {isCompact ? core.id : `C${core.id}`}
                </div>
                <div className={cn(
                  "font-mono tabular-nums leading-tight mt-1",
                  isCompact ? "text-[10px]" : "text-xs",
                  isOffline
                    ? (isDark ? "text-zinc-600" : "text-zinc-400")
                    : (isDark ? "text-zinc-200" : "text-zinc-800")
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
