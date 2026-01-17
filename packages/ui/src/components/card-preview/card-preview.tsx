"use client";

import type { JSX } from "react";
import { cn } from "@workspace/ui/lib/utils";
import { UsageCard } from "../usage-card";
import { Sparkline, DualSparkline } from "../sparkline";
import { getUsageColor, cardMetadata } from "../dashboard-cards-utils";
import type { CardPreviewProps, ServerPreviewData } from "../dashboard-cards-types";

interface CardPreviewComponentProps extends CardPreviewProps {
  server: ServerPreviewData;
}

export const CardPreview = ({ cardId, server }: CardPreviewComponentProps): JSX.Element => {
  const valueColor = "text-zinc-200";
  const badgeBg = "bg-zinc-800 text-zinc-300";

  switch (cardId) {
    case "instance-name":
      return (
        <UsageCard className="h-full flex items-center justify-center">
          <div className={cn("text-lg font-mono uppercase", "text-zinc-400")}>
            {server.name}
          </div>
        </UsageCard>
      );

    case "container-controls":
      return (
        <UsageCard className="h-full flex items-center justify-center px-4">
          <div className="flex gap-2 w-full justify-center">
            {["Start", "Stop", "Kill", "Restart"].map((label) => (
              <span
                key={label}
                className={cn(
                  "px-2 py-1 rounded text-[10px] font-medium uppercase",
                  "bg-zinc-800 text-zinc-400"
                )}
              >
                {label}
              </span>
            ))}
          </div>
        </UsageCard>
      );

    case "system-info":
      return (
        <UsageCard className="h-full p-3">
          <div className={cn("text-[10px] uppercase mb-2", "text-zinc-400")}>
            System Info
          </div>
          <div className="space-y-1 text-[10px]">
            <div className={valueColor}>{server.system.os}</div>
            <div className={cn("font-mono", valueColor)}>{server.system.osVersion}</div>
          </div>
        </UsageCard>
      );

    case "network-info":
      return (
        <UsageCard className="h-full p-3">
          <div className={cn("text-[10px] uppercase mb-2", "text-zinc-400")}>
            Network Info
          </div>
          <div className="space-y-1 text-[10px]">
            <div className={cn("font-mono", valueColor)}>{server.networkConfig.ipAddress}</div>
            <div className="flex gap-1 mt-1">
              <span className={cn("px-1 py-0.5 rounded text-[8px]", badgeBg)}>{server.networkConfig.port}</span>
            </div>
          </div>
        </UsageCard>
      );

    case "cpu":
      return (
        <UsageCard className="h-full p-3">
          <div className={cn("text-[10px] uppercase mb-1", "text-zinc-400")}>
            CPU
          </div>
          <div className={cn("text-xl font-mono", "text-zinc-100")}>
            {server.cpu.usage.percentage}%
          </div>
          <div className="mt-2">
            <Sparkline data={server.cpu.usage.history} color={getUsageColor(server.cpu.usage.percentage)} height={30} />
          </div>
        </UsageCard>
      );

    case "ram":
      return (
        <UsageCard className="h-full p-3">
          <div className={cn("text-[10px] uppercase mb-1", "text-zinc-400")}>
            RAM
          </div>
          <div className={cn("text-xl font-mono", "text-zinc-100")}>
            {server.memory.usage.percentage}%
          </div>
          <div className="mt-2">
            <Sparkline data={server.memory.usage.history} color={getUsageColor(server.memory.usage.percentage)} height={30} />
          </div>
        </UsageCard>
      );

    case "disk":
      return (
        <UsageCard className="h-full p-3">
          <div className={cn("text-[10px] uppercase mb-1", "text-zinc-400")}>
            DISK
          </div>
          <div className={cn("text-xl font-mono", "text-zinc-100")}>
            {server.disk.usage.percentage}%
          </div>
          <div className="mt-2">
            <Sparkline data={server.disk.usage.history} color={getUsageColor(server.disk.usage.percentage)} height={30} />
          </div>
        </UsageCard>
      );

    case "network-usage":
      return (
        <UsageCard className="h-full p-3">
          <div className={cn("text-[10px] uppercase mb-1", "text-zinc-400")}>
            Network
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-blue-400">↓ {server.network.download}</span>
            <span className="text-purple-400">↑ {server.network.upload}</span>
          </div>
          <div className="mt-2">
            <DualSparkline
              data1={server.network.downloadHistory}
              data2={server.network.uploadHistory}
              color1="#3b82f6"
              color2="#a855f7"
              height={30}
            />
          </div>
        </UsageCard>
      );

    default:
      return (
        <UsageCard className="h-full flex items-center justify-center">
          <div className={cn("text-sm", "text-zinc-400")}>
            {cardMetadata[cardId]?.name || cardId}
          </div>
        </UsageCard>
      );
  }
};
