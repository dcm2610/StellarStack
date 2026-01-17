"use client";

import { useMemo } from "react";
import { createPortal } from "react-dom";
import { cn } from "@workspace/ui/lib/utils";
import type { TimestampColumnTooltipProps, TooltipPosition } from "./types";

export type { TimestampColumnTooltipProps, TooltipPosition };

const formatLocalTime = (timestamp: number, timezone: string): string => {
  const date = new Date(timestamp);
  return date.toLocaleString("en-GB", {
    timeZone: timezone,
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
    hour12: true,
  });
};

const formatRelativeTime = (timestamp: number): string => {
  const now = Date.now();
  const diff = now - timestamp;

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const months = Math.floor(days / 30);
  const years = Math.floor(months / 12);

  if (years > 0) return `${years} year${years > 1 ? "s" : ""} ago`;
  if (months > 0) return `${months} month${months > 1 ? "s" : ""} ago`;
  if (days > 0) return `${days} day${days > 1 ? "s" : ""} ago`;
  if (hours > 0) return `${hours} hour${hours > 1 ? "s" : ""} ago`;
  if (minutes > 0) return `${minutes} minute${minutes > 1 ? "s" : ""} ago`;
  if (seconds > 0) return `${seconds} second${seconds > 1 ? "s" : ""} ago`;
  return "just now";
};

export const TimestampColumnTooltip = ({ timestamp, position }: TimestampColumnTooltipProps) => {
  const formats = useMemo(() => {
    const localTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return {
      local: formatLocalTime(timestamp, localTimezone),
      localTimezone,
      utc: formatLocalTime(timestamp, "UTC"),
      relative: formatRelativeTime(timestamp),
      unix: timestamp,
    };
  }, [timestamp]);

  if (typeof window === "undefined") return null;

  const valueColor = "text-zinc-200";

  return createPortal(
    <div
      className={cn(
        "fixed z-50 p-3 border min-w-[280px] pointer-events-none animate-in fade-in-0 zoom-in-95 duration-100 backdrop-blur-md",
        "bg-[#0f0f0f]/80 border-zinc-200/10"
      )}
      style={{
        top: position.top,
        left: position.left,
      }}
    >
      {/* Corner accents */}
      <div className={cn("absolute top-0 left-0 w-2 h-2 border-t border-l", "border-zinc-500")} />
      <div className={cn("absolute top-0 right-0 w-2 h-2 border-t border-r", "border-zinc-500")} />
      <div className={cn("absolute bottom-0 left-0 w-2 h-2 border-b border-l", "border-zinc-500")} />
      <div className={cn("absolute bottom-0 right-0 w-2 h-2 border-b border-r", "border-zinc-500")} />

      <div className="space-y-2 text-xs">
        <div className="flex justify-between gap-4">
          <span className="text-zinc-500">{formats.localTimezone}</span>
          <span className={cn(valueColor, "font-mono")}>{formats.local}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-zinc-500">UTC</span>
          <span className={cn(valueColor, "font-mono")}>{formats.utc}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-zinc-500">Relative</span>
          <span className={valueColor}>{formats.relative}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-zinc-500">Timestamp</span>
          <span className={cn(valueColor, "font-mono")}>{formats.unix}</span>
        </div>
      </div>
    </div>,
    document.body
  );
};
