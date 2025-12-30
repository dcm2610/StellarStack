"use client";

import { useState, useEffect, type JSX } from "react";
import { useParams } from "next/navigation";
import { useTheme as useNextTheme } from "next-themes";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@workspace/ui/lib/utils";
import { Button } from "@workspace/ui/components/button";
import { SidebarTrigger } from "@workspace/ui/components/sidebar";
import { Spinner } from "@workspace/ui/components/spinner";
import {
  BsSun,
  BsMoon,
  BsPlayFill,
  BsStopFill,
  BsArrowRepeat,
  BsPersonFill,
  BsGear,
  BsFileEarmark,
  BsDatabase,
  BsChevronDown,
  BsArrowReturnRight,
  BsFolder,
  BsArchive,
  BsTerminal,
  BsShieldLock,
  BsGlobe,
  BsTrash,
} from "react-icons/bs";
import { useServer } from "@/components/server-provider";
import { ServerInstallingPlaceholder } from "@/components/server-installing-placeholder";
import { useActivity } from "@/hooks/queries";
import type { ActivityLog } from "@/lib/api";

// Map API event types to display configuration
const eventConfig: Record<string, { icon: JSX.Element; label: string; color: string }> = {
  "server:power.start": {
    icon: <BsPlayFill className="h-4 w-4" />,
    label: "Server started",
    color: "text-green-500",
  },
  "server:power.stop": {
    icon: <BsStopFill className="h-4 w-4" />,
    label: "Server stopped",
    color: "text-red-500",
  },
  "server:power.restart": {
    icon: <BsArrowRepeat className="h-4 w-4" />,
    label: "Server restarted",
    color: "text-amber-500",
  },
  "server:power.kill": {
    icon: <BsStopFill className="h-4 w-4" />,
    label: "Server killed",
    color: "text-red-600",
  },
  "server:console.command": {
    icon: <BsTerminal className="h-4 w-4" />,
    label: "Command executed",
    color: "text-blue-500",
  },
  "server:settings.create": {
    icon: <BsGear className="h-4 w-4" />,
    label: "Server created",
    color: "text-purple-500",
  },
  "server:settings.update": {
    icon: <BsGear className="h-4 w-4" />,
    label: "Server updated",
    color: "text-purple-500",
  },
  "server:settings.delete": {
    icon: <BsTrash className="h-4 w-4" />,
    label: "Server deleted",
    color: "text-red-500",
  },
  "server:settings.reinstall": {
    icon: <BsArrowRepeat className="h-4 w-4" />,
    label: "Server reinstalled",
    color: "text-amber-500",
  },
  "server:startup.update": {
    icon: <BsGear className="h-4 w-4" />,
    label: "Startup updated",
    color: "text-purple-500",
  },
  "server:file.read": {
    icon: <BsFileEarmark className="h-4 w-4" />,
    label: "File read",
    color: "text-zinc-500",
  },
  "server:file.write": {
    icon: <BsFileEarmark className="h-4 w-4" />,
    label: "File modified",
    color: "text-cyan-500",
  },
  "server:file.delete": {
    icon: <BsTrash className="h-4 w-4" />,
    label: "File deleted",
    color: "text-red-500",
  },
  "server:file.rename": {
    icon: <BsFileEarmark className="h-4 w-4" />,
    label: "File renamed",
    color: "text-cyan-500",
  },
  "server:file.copy": {
    icon: <BsFileEarmark className="h-4 w-4" />,
    label: "File copied",
    color: "text-cyan-500",
  },
  "server:file.compress": {
    icon: <BsArchive className="h-4 w-4" />,
    label: "Files compressed",
    color: "text-cyan-500",
  },
  "server:file.decompress": {
    icon: <BsArchive className="h-4 w-4" />,
    label: "Archive extracted",
    color: "text-cyan-500",
  },
  "server:file.upload": {
    icon: <BsFileEarmark className="h-4 w-4" />,
    label: "File uploaded",
    color: "text-green-500",
  },
  "server:file.download": {
    icon: <BsFileEarmark className="h-4 w-4" />,
    label: "File downloaded",
    color: "text-blue-500",
  },
  "server:directory.create": {
    icon: <BsFolder className="h-4 w-4" />,
    label: "Directory created",
    color: "text-cyan-500",
  },
  "server:directory.delete": {
    icon: <BsFolder className="h-4 w-4" />,
    label: "Directory deleted",
    color: "text-red-500",
  },
  "server:backup.create": {
    icon: <BsDatabase className="h-4 w-4" />,
    label: "Backup created",
    color: "text-green-500",
  },
  "server:backup.delete": {
    icon: <BsDatabase className="h-4 w-4" />,
    label: "Backup deleted",
    color: "text-red-500",
  },
  "server:backup.restore": {
    icon: <BsDatabase className="h-4 w-4" />,
    label: "Backup restored",
    color: "text-amber-500",
  },
  "server:backup.download": {
    icon: <BsDatabase className="h-4 w-4" />,
    label: "Backup downloaded",
    color: "text-blue-500",
  },
  "server:backup.lock": {
    icon: <BsShieldLock className="h-4 w-4" />,
    label: "Backup locked",
    color: "text-purple-500",
  },
  "server:backup.unlock": {
    icon: <BsShieldLock className="h-4 w-4" />,
    label: "Backup unlocked",
    color: "text-purple-500",
  },
  "server:allocation.add": {
    icon: <BsGlobe className="h-4 w-4" />,
    label: "Allocation added",
    color: "text-green-500",
  },
  "server:allocation.remove": {
    icon: <BsGlobe className="h-4 w-4" />,
    label: "Allocation removed",
    color: "text-red-500",
  },
  "server:transfer.start": {
    icon: <BsArrowRepeat className="h-4 w-4" />,
    label: "Transfer started",
    color: "text-amber-500",
  },
  "server:transfer.complete": {
    icon: <BsArrowRepeat className="h-4 w-4" />,
    label: "Transfer completed",
    color: "text-green-500",
  },
  "server:transfer.fail": {
    icon: <BsArrowRepeat className="h-4 w-4" />,
    label: "Transfer failed",
    color: "text-red-500",
  },
  "server:webhook.create": {
    icon: <BsGlobe className="h-4 w-4" />,
    label: "Webhook created",
    color: "text-green-500",
  },
  "server:webhook.update": {
    icon: <BsGlobe className="h-4 w-4" />,
    label: "Webhook updated",
    color: "text-purple-500",
  },
  "server:webhook.delete": {
    icon: <BsGlobe className="h-4 w-4" />,
    label: "Webhook deleted",
    color: "text-red-500",
  },
  "user:auth.login": {
    icon: <BsPersonFill className="h-4 w-4" />,
    label: "User logged in",
    color: "text-blue-500",
  },
  "user:auth.logout": {
    icon: <BsPersonFill className="h-4 w-4" />,
    label: "User logged out",
    color: "text-zinc-500",
  },
  "user:auth.2fa-enable": {
    icon: <BsShieldLock className="h-4 w-4" />,
    label: "2FA enabled",
    color: "text-green-500",
  },
  "user:auth.2fa-disable": {
    icon: <BsShieldLock className="h-4 w-4" />,
    label: "2FA disabled",
    color: "text-red-500",
  },
};

const getEventConfig = (event: string) => {
  return (
    eventConfig[event] || {
      icon: <BsGear className="h-4 w-4" />,
      label: event.replace(/[.:]/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()),
      color: "text-zinc-500",
    }
  );
};

const formatTimestamp = (timestamp: string) => {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} minute${minutes !== 1 ? "s" : ""} ago`;
  if (hours < 24) return `${hours} hour${hours !== 1 ? "s" : ""} ago`;
  if (days < 7) return `${days} day${days !== 1 ? "s" : ""} ago`;
  return date.toLocaleDateString();
};

const ActivityPage = (): JSX.Element | null => {
  const params = useParams();
  const serverId = params.id as string;
  const { server, isInstalling } = useServer();
  const { setTheme, resolvedTheme } = useNextTheme();
  const [mounted, setMounted] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // Fetch activity logs
  const { data: activityData, isLoading } = useActivity(serverId, { limit: 50 });

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = mounted ? resolvedTheme === "dark" : true;

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  if (!mounted) return null;

  if (isInstalling) {
    return (
      <div className="min-h-svh">
        {/* Background is now rendered in the layout for persistence */}
        <ServerInstallingPlaceholder isDark={isDark} serverName={server?.name} />
      </div>
    );
  }

  const logs = activityData?.logs || [];

  return (
    <div className="relative min-h-svh transition-colors">
      {/* Background is now rendered in the layout for persistence */}

      <div className="relative p-8">
        <div className="mx-auto max-w-6xl">
          {/* Header */}
          <div className="mb-8 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <SidebarTrigger
                className={cn(
                  "transition-all hover:scale-110 active:scale-95",
                  isDark ? "text-zinc-400 hover:text-zinc-100" : "text-zinc-600 hover:text-zinc-900"
                )}
              />
              <div>
                <h1
                  className={cn(
                    "text-2xl font-light tracking-wider",
                    isDark ? "text-zinc-100" : "text-zinc-800"
                  )}
                >
                  ACTIVITY LOG
                </h1>
                <p className={cn("mt-1 text-sm", isDark ? "text-zinc-500" : "text-zinc-500")}>
                  Server {server?.shortId || serverId.slice(0, 8)} • {logs.length} recent activities
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setTheme(isDark ? "light" : "dark")}
              className={cn(
                "p-2 transition-all hover:scale-110 active:scale-95",
                isDark
                  ? "border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-100"
                  : "border-zinc-300 text-zinc-600 hover:border-zinc-400 hover:text-zinc-900"
              )}
            >
              {isDark ? <BsSun className="h-4 w-4" /> : <BsMoon className="h-4 w-4" />}
            </Button>
          </div>

          {/* Activity Timeline */}
          <div
            className={cn(
              "relative border",
              isDark
                ? "border-zinc-200/10 bg-gradient-to-b from-[#141414] via-[#0f0f0f] to-[#0a0a0a]"
                : "border-zinc-300 bg-gradient-to-b from-white via-zinc-50 to-zinc-100"
            )}
          >
            {/* Corner decorations */}
            <div
              className={cn(
                "absolute top-0 left-0 h-3 w-3 border-t border-l",
                isDark ? "border-zinc-500" : "border-zinc-400"
              )}
            />
            <div
              className={cn(
                "absolute top-0 right-0 h-3 w-3 border-t border-r",
                isDark ? "border-zinc-500" : "border-zinc-400"
              )}
            />
            <div
              className={cn(
                "absolute bottom-0 left-0 h-3 w-3 border-b border-l",
                isDark ? "border-zinc-500" : "border-zinc-400"
              )}
            />
            <div
              className={cn(
                "absolute right-0 bottom-0 h-3 w-3 border-r border-b",
                isDark ? "border-zinc-500" : "border-zinc-400"
              )}
            />

            {isLoading ? (
              <div className="flex items-center justify-center py-20">
                <Spinner className="h-8 w-8" />
              </div>
            ) : logs.length === 0 ? (
              <div
                className={cn(
                  "flex flex-col items-center justify-center py-20",
                  isDark ? "text-zinc-500" : "text-zinc-400"
                )}
              >
                <BsGear className="mb-4 h-12 w-12 opacity-50" />
                <p className="text-sm">No activity recorded yet</p>
              </div>
            ) : (
              logs.map((activity: ActivityLog, index: number) => {
                const config = getEventConfig(activity.event);
                const hasMetadata = activity.metadata && Object.keys(activity.metadata).length > 0;
                const isExpanded = expandedIds.has(activity.id);

                return (
                  <div
                    key={activity.id}
                    className={cn(
                      index !== logs.length - 1 &&
                        (isDark ? "border-b border-zinc-800/50" : "border-b border-zinc-200")
                    )}
                  >
                    <div
                      onClick={() => hasMetadata && toggleExpanded(activity.id)}
                      className={cn(
                        "flex items-start gap-4 px-6 py-4 transition-colors",
                        isDark ? "hover:bg-zinc-800/20" : "hover:bg-zinc-50",
                        hasMetadata && "cursor-pointer"
                      )}
                    >
                      <div
                        className={cn(
                          "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center border",
                          isDark ? "border-zinc-700 bg-zinc-800/50" : "border-zinc-300 bg-zinc-100",
                          config.color
                        )}
                      >
                        {config.icon}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-3">
                          <span
                            className={cn(
                              "text-sm font-medium",
                              isDark ? "text-zinc-200" : "text-zinc-700"
                            )}
                          >
                            {config.label}
                          </span>
                          {activity.ip && (
                            <span
                              className={cn(
                                "border px-2 py-0.5 text-xs",
                                isDark
                                  ? "border-zinc-700 text-zinc-500"
                                  : "border-zinc-300 text-zinc-500"
                              )}
                            >
                              {activity.ip}
                            </span>
                          )}
                        </div>
                        {!!activity.metadata?.command && (
                          <p
                            className={cn(
                              "mt-1 font-mono text-xs",
                              isDark ? "text-zinc-500" : "text-zinc-400"
                            )}
                          >
                            {String(activity.metadata.command)}
                          </p>
                        )}
                        {!!activity.metadata?.path && !activity.metadata?.command && (
                          <p
                            className={cn(
                              "mt-1 font-mono text-xs",
                              isDark ? "text-zinc-500" : "text-zinc-400"
                            )}
                          >
                            {String(activity.metadata.path)}
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <span className={cn("text-xs", isDark ? "text-zinc-600" : "text-zinc-400")}>
                          {formatTimestamp(activity.timestamp)}
                        </span>
                        {hasMetadata && (
                          <motion.div
                            animate={{ rotate: isExpanded ? 180 : 0 }}
                            transition={{ duration: 0.2 }}
                          >
                            <BsChevronDown
                              className={cn("h-4 w-4", isDark ? "text-zinc-600" : "text-zinc-400")}
                            />
                          </motion.div>
                        )}
                      </div>
                    </div>

                    {/* Expandable metadata section */}
                    <AnimatePresence>
                      {isExpanded && activity.metadata && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div className="relative px-6 pt-1 pb-4">
                            {/* Arrow connector - positioned below the icon */}
                            <div className="absolute top-0 left-[2.2rem] flex items-start gap-1">
                              <BsArrowReturnRight
                                className={cn(
                                  "mt-1 h-4 w-4",
                                  isDark ? "text-zinc-600" : "text-zinc-400"
                                )}
                              />
                            </div>
                            <div
                              className={cn(
                                "ml-8",
                                "grid grid-cols-2 gap-4 border p-4 md:grid-cols-3 lg:grid-cols-4",
                                isDark
                                  ? "border-zinc-800 bg-zinc-900/50"
                                  : "border-zinc-200 bg-white"
                              )}
                            >
                              {Object.entries(activity.metadata).map(([key, value]) => (
                                <div key={key}>
                                  <span
                                    className={cn(
                                      "block text-[10px] font-medium tracking-wider uppercase",
                                      isDark ? "text-zinc-500" : "text-zinc-400"
                                    )}
                                  >
                                    {key.replace(/_/g, " ")}
                                  </span>
                                  <span
                                    className={cn(
                                      "mt-0.5 block font-mono text-xs break-all",
                                      isDark ? "text-zinc-300" : "text-zinc-700"
                                    )}
                                  >
                                    {typeof value === "object"
                                      ? JSON.stringify(value)
                                      : String(value)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })
            )}
          </div>

          {/* Pagination info */}
          {activityData && activityData.total > 0 && (
            <div
              className={cn("mt-4 text-center text-xs", isDark ? "text-zinc-600" : "text-zinc-400")}
            >
              Showing {logs.length} of {activityData.total} activities
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ActivityPage;
