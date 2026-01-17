"use client";

import type { JSX } from "react";
import { cn } from "@workspace/ui/lib/utils";
import { UsageCard, UsageCardContent, UsageCardTitle } from "../usage-card";
import { AnimatedNumber } from "../animated-number";
import { useDragDropGrid } from "../drag-drop-grid";
import type { CardProps, Player, ContainerStatus, PlayersOnlineCardLabels } from "../dashboard-cards-types";

interface PlayersOnlineCardProps extends CardProps {
  isOffline: boolean;
  players: Player[];
  maxPlayers: number;
  containerStatus: ContainerStatus;
  labels: PlayersOnlineCardLabels;
}

export const PlayersOnlineCard = ({
  itemId,
  isOffline,
  players,
  maxPlayers,
  containerStatus,
  labels,
}: PlayersOnlineCardProps): JSX.Element => {
  const { getItemSize } = useDragDropGrid();
  const size = getItemSize(itemId);

  const isXxs = size === "xxs" || size === "xxs-wide";
  const isXs = size === "xs";
  const isSm = size === "sm";
  const isCompact = isXxs || isXs;

  const isRunning = containerStatus === "running";
  const maxVisible = isSm ? 8 : 4;
  const remainingCount = players.length - maxVisible;

  if (isXxs) {
    return (
      <UsageCard className={cn("h-full flex items-center justify-between px-6", isOffline && "opacity-60")}>
        <span className={cn("text-xs font-medium uppercase text-zinc-400")}>{labels.titleShort}</span>
        <span className={cn("text-xl font-mono text-zinc-100")}>
          {isOffline || !isRunning ? "--" : <><AnimatedNumber value={players.length} />/{maxPlayers}</>}
        </span>
      </UsageCard>
    );
  }

  return (
    <UsageCard className={cn("h-full flex flex-col", isXs && "p-4", isOffline && "opacity-60")}>
      <UsageCardTitle className={cn("opacity-80", isCompact ? "text-xs mb-2" : "text-md")}>
        {labels.title}
      </UsageCardTitle>
      <UsageCardContent className={cn("flex-1 flex flex-col", isXs ? "space-y-1" : undefined)}>
        <div className="flex items-baseline gap-1">
          <span className={cn(
            "text-zinc-100",
            isXs ? "text-2xl" : "text-4xl"
          )}>
            {isOffline || !isRunning ? "--" : <AnimatedNumber value={players.length} />}
          </span>
          <span className={cn(
            "text-zinc-500",
            isXs ? "text-sm" : "text-lg"
          )}>
            /{maxPlayers}
          </span>
        </div>

        {(isXs || isSm) && isRunning && players.length > 0 && (
          <div className={cn(
            "mt-2 flex-1 overflow-hidden text-zinc-400"
          )}>
            <div className={cn(
              "text-[10px] uppercase font-medium mb-1 text-zinc-500"
            )}>
              {labels.online}
            </div>
            <div className="space-y-0.5 overflow-y-auto max-h-full">
              {players.slice(0, maxVisible).map((player) => (
                <div
                  key={player.id}
                  className={cn(
                    "text-xs font-mono truncate text-zinc-300"
                  )}
                >
                  {player.name}
                </div>
              ))}
              {remainingCount > 0 && (
                <div className={cn(
                  "text-[10px] text-zinc-500"
                )}>
                  +{remainingCount} more
                </div>
              )}
            </div>
          </div>
        )}
      </UsageCardContent>
    </UsageCard>
  );
};
