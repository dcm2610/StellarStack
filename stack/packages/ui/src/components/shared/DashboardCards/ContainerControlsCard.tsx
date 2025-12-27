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

  // Start button should be enabled when stopped (even if isOffline is true due to stopped state)
  const startDisabled = isRunning || isTransitioning;
  const stopDisabled = isStopped || isTransitioning || isOffline;
  const killDisabled = isStopped || isOffline;
  const restartDisabled = isStopped || isTransitioning || isOffline;

  return (
    <UsageCard isDark={isDark} className="h-full flex items-center justify-center px-8">
      <div className="flex gap-4 w-full justify-between max-w-md">
        <button
          onClick={onStart}
          disabled={startDisabled}
          className={cn(
            buttonBase,
            startDisabled ? disabledColors : buttonColors,
            startDisabled && "cursor-not-allowed"
          )}
        >
          {labels.start}
        </button>
        <button
          onClick={onStop}
          disabled={stopDisabled}
          className={cn(
            buttonBase,
            stopDisabled ? disabledColors : buttonColors,
            stopDisabled && "cursor-not-allowed"
          )}
        >
          {labels.stop}
        </button>
        <button
          onClick={onKill}
          disabled={killDisabled}
          className={cn(
            buttonBase,
            killDisabled ? disabledColors : buttonColors,
            killDisabled && "cursor-not-allowed"
          )}
        >
          {labels.kill}
        </button>
        <button
          onClick={onRestart}
          disabled={restartDisabled}
          className={cn(
            buttonBase,
            restartDisabled ? disabledColors : buttonColors,
            restartDisabled && "cursor-not-allowed"
          )}
        >
          {labels.restart}
        </button>
      </div>
    </UsageCard>
  );
};
