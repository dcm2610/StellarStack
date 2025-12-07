"use client";

import { toast } from "sonner";
import { useServerStore } from "@/stores/connectionStore";
import { t } from "@/lib/i18n";
import type { ContainerStatus } from "@/types/server";

interface UseContainerControlsReturn {
  status: ContainerStatus;
  isOffline: boolean;
  handleStart: () => void;
  handleStop: () => void;
  handleKill: () => void;
  handleRestart: () => void;
}

export const useContainerControls = (): UseContainerControlsReturn => {
  const isOffline = useServerStore((state) => state.isOffline);
  const status = useServerStore((state) => state.server.status);
  const setContainerStatus = useServerStore((state) => state.setContainerStatus);

  const handleStart = (): void => {
    if (isOffline) {
      toast.error(t("toast.cannotStartOffline"));
      return;
    }
    setContainerStatus("starting");
    const toastId = toast.loading(t("toast.serverStarting"));
    setTimeout(() => {
      setContainerStatus("running");
      toast.dismiss(toastId);
      toast.success(t("toast.serverStarted"));
    }, 1500);
  };

  const handleStop = (): void => {
    if (isOffline) {
      toast.error(t("toast.cannotStopOffline"));
      return;
    }
    setContainerStatus("stopping");
    const toastId = toast.loading(t("toast.serverStopping"));
    setTimeout(() => {
      setContainerStatus("stopped");
      toast.dismiss(toastId);
      toast.info(t("toast.serverStopped"));
    }, 1500);
  };

  const handleKill = (): void => {
    if (isOffline) {
      toast.error(t("toast.cannotKillOffline"));
      return;
    }
    setContainerStatus("stopped");
    toast.warning(t("toast.serverKilled"));
  };

  const handleRestart = (): void => {
    if (isOffline) {
      toast.error(t("toast.cannotRestartOffline"));
      return;
    }
    setContainerStatus("stopping");
    const toastId = toast.loading(t("toast.serverRestarting"));
    setTimeout(() => {
      setContainerStatus("starting");
      setTimeout(() => {
        setContainerStatus("running");
        toast.dismiss(toastId);
        toast.success(t("toast.serverRestarted"));
      }, 1000);
    }, 1000);
  };

  return {
    status,
    isOffline,
    handleStart,
    handleStop,
    handleKill,
    handleRestart,
  };
};
