"use client";

import type { JSX } from "react";
import { cn } from "@workspace/ui/lib/utils";
import { UsageCard } from "../usage-card";
import type {
  CardProps,
  ContainerStatus,
  ContainerControlsCardLabels,
} from "../dashboard-cards-types";

interface ContainerControlsCardProps extends CardProps {
  isDark: boolean;
  isOffline: boolean;
  status: ContainerStatus;
  onStart: () => void;
  onStop: () => void;
  onKill: () => void;
  onRestart: () => void;
  labels: ContainerControlsCardLabels;
  /** Optional loading states for each action */
  loadingStates?: {
    start?: boolean;
    stop?: boolean;
    kill?: boolean;
    restart?: boolean;
  };
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
  loadingStates = {},
}: ContainerControlsCardProps): JSX.Element => {
  const isRunning = status === "running";
  const isStarting = status === "starting";
  const isStopped = status === "stopped";
  const isStopping = status === "stopping";

  // Check if any action is loading
  const anyLoading =
    loadingStates.start || loadingStates.stop || loadingStates.kill || loadingStates.restart;

  const buttonBase =
    "px-4 py-2 text-xs font-medium uppercase tracking-wider transition-colors border bg-transparent flex items-center justify-center gap-2 min-w-[80px]";
  const buttonColors = isDark
    ? "border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-zinc-100"
    : "border-zinc-300 text-zinc-600 hover:border-zinc-400 hover:text-zinc-800";
  const disabledColors = isDark ? "border-zinc-800 text-zinc-600" : "border-zinc-200 text-zinc-400";

  // Start: disabled when running, starting, stopping, or any action loading
  const startDisabled = isRunning || isStarting || isStopping || anyLoading;
  // Stop: enabled when running or starting (can stop a starting server)
  const stopDisabled = isStopped || isStopping || isOffline || anyLoading;
  // Kill: always available when not stopped (force kill even during transitions)
  const killDisabled = isStopped || isOffline || anyLoading;
  // Restart: disabled during transitions
  const restartDisabled = isStopped || isStarting || isStopping || isOffline || anyLoading;

  return (
    <UsageCard isDark={isDark} className="flex h-full items-center justify-center px-8">
      <div className="flex w-full max-w-md justify-between gap-4">
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
