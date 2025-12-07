"use client";

import type { JSX } from "react";
import { cn } from "../../../lib/utils";
import { UsageCard } from "../UsageCard/UsageCard";
import type { CardProps, ContainerStatus, ContainerControlsCardLabels } from "./types";

interface ContainerControlsCardProps extends CardProps {
  isDark: boolean;
  isOffline: boolean;
  status: ContainerStatus;
  onStart: () => void;
  onStop: () => void;
  onKill: () => void;
  onRestart: () => void;
  labels: ContainerControlsCardLabels;
}

export const ContainerControlsCard = ({
  isDark,
  isOffline,
  status,
  onStart,
  onStop,
  onKill,
  onRestart,
  labels,
}: ContainerControlsCardProps): JSX.Element => {
  const isRunning = status === "running";
  const isStopped = status === "stopped";
  const isTransitioning = status === "starting" || status === "stopping";

  const buttonBase = "px-4 py-2 text-xs font-medium uppercase tracking-wider transition-colors border bg-transparent";
  const buttonColors = isDark
    ? "border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-zinc-100"
    : "border-zinc-300 text-zinc-600 hover:border-zinc-400 hover:text-zinc-800";
  const disabledColors = isDark
    ? "border-zinc-800 text-zinc-600"
    : "border-zinc-200 text-zinc-400";

  return (
    <UsageCard isDark={isDark} className={cn("h-full flex items-center justify-center px-8", isOffline && "opacity-60")}>
      <div className="flex gap-4 w-full justify-between max-w-md">
        <button
          onClick={onStart}
          disabled={isRunning || isTransitioning || isOffline}
          className={cn(
            buttonBase,
            (isRunning || isTransitioning || isOffline) ? disabledColors : buttonColors,
            (isRunning || isTransitioning || isOffline) && "cursor-not-allowed"
          )}
        >
          {labels.start}
        </button>
        <button
          onClick={onStop}
          disabled={isStopped || isTransitioning || isOffline}
          className={cn(
            buttonBase,
            (isStopped || isTransitioning || isOffline) ? disabledColors : buttonColors,
            (isStopped || isTransitioning || isOffline) && "cursor-not-allowed"
          )}
        >
          {labels.stop}
        </button>
        <button
          onClick={onKill}
          disabled={isStopped || isOffline}
          className={cn(
            buttonBase,
            (isStopped || isOffline) ? disabledColors : buttonColors,
            (isStopped || isOffline) && "cursor-not-allowed"
          )}
        >
          {labels.kill}
        </button>
        <button
          onClick={onRestart}
          disabled={isStopped || isTransitioning || isOffline}
          className={cn(
            buttonBase,
            (isStopped || isTransitioning || isOffline) ? disabledColors : buttonColors,
            (isStopped || isTransitioning || isOffline) && "cursor-not-allowed"
          )}
        >
          {labels.restart}
        </button>
      </div>
    </UsageCard>
  );
};
