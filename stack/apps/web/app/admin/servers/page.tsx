"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme as useNextTheme } from "next-themes";
import { cn } from "@workspace/ui/lib/utils";
import { Button } from "@workspace/ui/components/button";
import { AnimatedBackground } from "@workspace/ui/components/shared/AnimatedBackground";
import { FadeIn, FloatingDots } from "@workspace/ui/components/shared/Animations";
import { ConfirmationModal } from "@workspace/ui/components/shared/ConfirmationModal";
import { ServerIcon, PlusIcon, TrashIcon, EditIcon, PlayIcon, SquareIcon, RefreshCwIcon, ArrowLeftIcon, ExternalLinkIcon } from "lucide-react";
import { servers } from "@/lib/api";
import type { Server } from "@/lib/api";
import { toast } from "sonner";

export default function AdminServersPage() {
  const router = useRouter();
  const { resolvedTheme } = useNextTheme();
  const [mounted, setMounted] = useState(false);
  const [serversList, setServersList] = useState<Server[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [serverToDelete, setServerToDelete] = useState<Server | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const fetchData = async () => {
    try {
      const serversData = await servers.list();
      setServersList(serversData);
    } catch (error) {
      toast.error("Failed to fetch servers");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const isDark = mounted ? resolvedTheme === "dark" : true;

  const openDeleteModal = (server: Server) => {
    setServerToDelete(server);
    setDeleteModalOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!serverToDelete) return;
    setIsDeleting(true);
    try {
      await servers.delete(serverToDelete.id);
      toast.success("Server deleted successfully");
      setDeleteModalOpen(false);
      setServerToDelete(null);
      fetchData();
    } catch (error) {
      toast.error("Failed to delete server");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleAction = async (server: Server, action: "start" | "stop" | "restart") => {
    try {
      if (action === "start") {
        await servers.start(server.id);
        toast.success("Server starting...");
      } else if (action === "stop") {
        await servers.stop(server.id);
        toast.success("Server stopping...");
      } else {
        await servers.restart(server.id);
        toast.success("Server restarting...");
      }
      fetchData();
    } catch (error) {
      toast.error(`Failed to ${action} server`);
    }
  };

  const getStatusColor = (status: Server["status"]) => {
    switch (status) {
      case "RUNNING":
        return "text-green-500 border-green-500";
      case "STOPPED":
        return "text-zinc-500 border-zinc-500";
      case "STARTING":
      case "STOPPING":
        return "text-amber-500 border-amber-500";
      case "INSTALLING":
        return "text-blue-500 border-blue-500";
      case "ERROR":
        return "text-red-500 border-red-500";
      default:
        return "text-zinc-500 border-zinc-500";
    }
  };

  if (!mounted) return null;

  return (
    <div className={cn(
      "min-h-svh transition-colors relative",
      isDark ? "bg-[#0b0b0a]" : "bg-[#f5f5f4]"
    )}>
      <AnimatedBackground isDark={isDark} />
      <FloatingDots isDark={isDark} count={15} />

      <div className="relative p-8">
        <div className="max-w-6xl mx-auto">
          <FadeIn delay={0}>
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-4">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => router.push("/admin")}
                  className={cn(
                    "p-2 transition-all hover:scale-110 active:scale-95",
                    isDark ? "text-zinc-400 hover:text-zinc-100" : "text-zinc-600 hover:text-zinc-900"
                  )}
                >
                  <ArrowLeftIcon className="w-4 h-4" />
                </Button>
                <div>
                  <h1 className={cn(
                    "text-2xl font-light tracking-wider",
                    isDark ? "text-zinc-100" : "text-zinc-800"
                  )}>
                    SERVERS
                  </h1>
                  <p className={cn(
                    "text-sm mt-1",
                    isDark ? "text-zinc-500" : "text-zinc-500"
                  )}>
                    Manage all game servers
                  </p>
                </div>
              </div>
              <Button
                onClick={() => router.push("/admin/servers/new")}
                className={cn(
                  "flex items-center gap-2 text-xs uppercase tracking-wider transition-all hover:scale-[1.02] active:scale-95",
                  isDark
                    ? "bg-zinc-100 text-zinc-900 hover:bg-zinc-200"
                    : "bg-zinc-800 text-zinc-100 hover:bg-zinc-700"
                )}
              >
                <PlusIcon className="w-4 h-4" />
                Create Server
              </Button>
            </div>
          </FadeIn>

          {/* Server List */}
          <FadeIn delay={0.1}>
            <div className="space-y-3">
              {isLoading ? (
                <div className={cn(
                  "text-center py-12 text-sm",
                  isDark ? "text-zinc-500" : "text-zinc-400"
                )}>
                  Loading servers...
                </div>
              ) : serversList.length === 0 ? (
                <div className={cn(
                  "text-center py-12 border",
                  isDark ? "border-zinc-800 text-zinc-500" : "border-zinc-200 text-zinc-400"
                )}>
                  No servers found. Create your first server.
                </div>
              ) : (
                serversList.map((server, index) => (
                  <FadeIn key={server.id} delay={0.1 + index * 0.05}>
                    <div
                      className={cn(
                        "relative p-5 border transition-all hover:scale-[1.005] group",
                        isDark
                          ? "bg-gradient-to-b from-[#141414] via-[#0f0f0f] to-[#0a0a0a] border-zinc-200/10 shadow-lg shadow-black/20 hover:border-zinc-700"
                          : "bg-gradient-to-b from-white via-zinc-50 to-zinc-100 border-zinc-300 shadow-lg shadow-zinc-400/20 hover:border-zinc-400"
                      )}
                    >
                      {/* Corner decorations */}
                      <div className={cn("absolute top-0 left-0 w-2 h-2 border-t border-l", isDark ? "border-zinc-600" : "border-zinc-400")} />
                      <div className={cn("absolute top-0 right-0 w-2 h-2 border-t border-r", isDark ? "border-zinc-600" : "border-zinc-400")} />
                      <div className={cn("absolute bottom-0 left-0 w-2 h-2 border-b border-l", isDark ? "border-zinc-600" : "border-zinc-400")} />
                      <div className={cn("absolute bottom-0 right-0 w-2 h-2 border-b border-r", isDark ? "border-zinc-600" : "border-zinc-400")} />

                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className={cn(
                            "p-2.5 border",
                            isDark ? "border-zinc-700 bg-zinc-800/50" : "border-zinc-300 bg-zinc-100"
                          )}>
                            <ServerIcon className={cn("w-5 h-5", isDark ? "text-purple-400" : "text-purple-600")} />
                          </div>
                          <div>
                            <div className="flex items-center gap-3">
                              <h2 className={cn(
                                "text-sm font-medium uppercase tracking-wider",
                                isDark ? "text-zinc-100" : "text-zinc-800"
                              )}>
                                {server.name}
                              </h2>
                              <span className={cn(
                                "text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 border",
                                getStatusColor(server.status)
                              )}>
                                {server.status}
                              </span>
                              {server.shortId && (
                                <span className={cn(
                                  "text-[10px] font-mono px-1.5 py-0.5",
                                  isDark ? "text-zinc-600 bg-zinc-800" : "text-zinc-400 bg-zinc-100"
                                )}>
                                  {server.shortId}
                                </span>
                              )}
                            </div>
                            <div className={cn(
                              "flex items-center gap-3 mt-1 text-xs",
                              isDark ? "text-zinc-500" : "text-zinc-500"
                            )}>
                              <span>{server.blueprint?.name || "Unknown"}</span>
                              <span className={cn(isDark ? "text-zinc-700" : "text-zinc-300")}>•</span>
                              <span>{server.node?.displayName || "Unknown"}</span>
                              <span className={cn(isDark ? "text-zinc-700" : "text-zinc-300")}>•</span>
                              <span className="font-mono">{server.memory}MB / {server.cpu}%</span>
                              <span className={cn(isDark ? "text-zinc-700" : "text-zinc-300")}>•</span>
                              <span>{server.owner?.name || "Unknown"}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => router.push(`/servers/${server.id}`)}
                            className={cn(
                              "text-xs p-2 transition-all hover:scale-110 active:scale-95",
                              isDark ? "border-purple-900/50 text-purple-400 hover:bg-purple-900/20" : "border-purple-200 text-purple-600 hover:bg-purple-50"
                            )}
                          >
                            <ExternalLinkIcon className="w-3.5 h-3.5" />
                          </Button>
                          {server.status === "STOPPED" && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleAction(server, "start")}
                              className={cn(
                                "text-xs p-2 transition-all hover:scale-110 active:scale-95",
                                isDark ? "border-green-900/50 text-green-400 hover:bg-green-900/20" : "border-green-200 text-green-600 hover:bg-green-50"
                              )}
                            >
                              <PlayIcon className="w-3.5 h-3.5" />
                            </Button>
                          )}
                          {server.status === "RUNNING" && (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleAction(server, "stop")}
                                className={cn(
                                  "text-xs p-2 transition-all hover:scale-110 active:scale-95",
                                  isDark ? "border-amber-900/50 text-amber-400 hover:bg-amber-900/20" : "border-amber-200 text-amber-600 hover:bg-amber-50"
                                )}
                              >
                                <SquareIcon className="w-3.5 h-3.5" />
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleAction(server, "restart")}
                                className={cn(
                                  "text-xs p-2 transition-all hover:scale-110 active:scale-95",
                                  isDark ? "border-blue-900/50 text-blue-400 hover:bg-blue-900/20" : "border-blue-200 text-blue-600 hover:bg-blue-50"
                                )}
                              >
                                <RefreshCwIcon className="w-3.5 h-3.5" />
                              </Button>
                            </>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => router.push(`/admin/servers/${server.id}/edit`)}
                            className={cn(
                              "text-xs p-2 transition-all hover:scale-110 active:scale-95",
                              isDark ? "border-zinc-700 text-zinc-400 hover:text-zinc-100" : "border-zinc-300 text-zinc-600 hover:text-zinc-900"
                            )}
                          >
                            <EditIcon className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openDeleteModal(server)}
                            className={cn(
                              "text-xs p-2 transition-all hover:scale-110 active:scale-95",
                              isDark ? "border-red-900/50 text-red-400 hover:bg-red-900/20" : "border-red-200 text-red-600 hover:bg-red-50"
                            )}
                          >
                            <TrashIcon className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </FadeIn>
                ))
              )}
            </div>
          </FadeIn>
        </div>
      </div>

      <ConfirmationModal
        open={deleteModalOpen}
        onOpenChange={setDeleteModalOpen}
        title="Delete Server"
        description={`Are you sure you want to delete "${serverToDelete?.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={handleDeleteConfirm}
        variant="danger"
        isDark={isDark}
        isLoading={isDeleting}
      />
    </div>
  );
}
