"use client";

import { useState, useEffect, useCallback, type JSX } from "react";
import { useParams } from "next/navigation";
import { useTheme as useNextTheme } from "next-themes";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@workspace/ui/lib/utils";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { AnimatedBackground } from "@workspace/ui/components/shared/AnimatedBackground";
import { FloatingDots } from "@workspace/ui/components/shared/Animations";
import { SidebarTrigger } from "@workspace/ui/components/sidebar";
import { ConfirmationModal } from "@workspace/ui/components/shared/ConfirmationModal";
import { FormModal } from "@workspace/ui/components/shared/FormModal";
import { Spinner } from "@workspace/ui/components/spinner";
import { BsSun, BsMoon, BsCloudDownload, BsDownload, BsTrash, BsPlus, BsCheckCircle, BsLock, BsUnlock } from "react-icons/bs";
import { servers } from "@/lib/api";
import type { Backup } from "@/lib/api";
import { useServer } from "@/components/server-provider";
import { toast } from "sonner";

const BackupsPage = (): JSX.Element | null => {
  const params = useParams();
  const serverId = params.id as string;
  const { server } = useServer();
  const { setTheme, resolvedTheme } = useNextTheme();
  const [mounted, setMounted] = useState(false);
  const [backups, setBackups] = useState<Backup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);

  // Modal states
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [restoreModalOpen, setRestoreModalOpen] = useState(false);
  const [selectedBackup, setSelectedBackup] = useState<Backup | null>(null);

  // Form states
  const [backupName, setBackupName] = useState("");

  useEffect(() => {
    setMounted(true);
  }, []);

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  const fetchBackups = useCallback(async () => {
    try {
      const data = await servers.backups.list(serverId);
      setBackups(data);
    } catch (error) {
      toast.error("Failed to fetch backups");
    } finally {
      setIsLoading(false);
    }
  }, [serverId]);

  useEffect(() => {
    fetchBackups();
  }, [fetchBackups]);

  const isDark = mounted ? resolvedTheme === "dark" : true;

  if (!mounted) return null;

  const openCreateModal = () => {
    setBackupName("");
    setCreateModalOpen(true);
  };

  const openDeleteModal = (backup: Backup) => {
    setSelectedBackup(backup);
    setDeleteModalOpen(true);
  };

  const openRestoreModal = (backup: Backup) => {
    setSelectedBackup(backup);
    setRestoreModalOpen(true);
  };

  const handleCreate = async () => {
    setIsCreating(true);
    try {
      await servers.backups.create(serverId, {
        name: backupName || undefined,
      });
      toast.success("Backup created");
      setCreateModalOpen(false);
      setBackupName("");
      fetchBackups();
    } catch (error) {
      toast.error("Failed to create backup");
    } finally {
      setIsCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedBackup) return;
    try {
      await servers.backups.delete(serverId, selectedBackup.id);
      toast.success("Backup deleted");
      setDeleteModalOpen(false);
      setSelectedBackup(null);
      fetchBackups();
    } catch (error) {
      toast.error("Failed to delete backup");
    }
  };

  const handleRestore = async () => {
    if (!selectedBackup) return;
    try {
      await servers.backups.restore(serverId, selectedBackup.id);
      toast.success("Backup restored");
      setRestoreModalOpen(false);
      setSelectedBackup(null);
    } catch (error) {
      toast.error("Failed to restore backup");
    }
  };

  const handleToggleLock = async (backup: Backup) => {
    try {
      await servers.backups.lock(serverId, backup.id, !backup.locked);
      toast.success(backup.locked ? "Backup unlocked" : "Backup locked");
      fetchBackups();
    } catch (error) {
      toast.error("Failed to update backup");
    }
  };

  return (
    <div className={cn(
      "min-h-svh transition-colors relative",
      isDark ? "bg-[#0b0b0a]" : "bg-[#f5f5f4]"
    )}>
      <AnimatedBackground isDark={isDark} />
      <FloatingDots isDark={isDark} count={15} />

      <div className="relative p-8">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-4">
              <SidebarTrigger className={cn(
                "transition-all hover:scale-110 active:scale-95",
                isDark ? "text-zinc-400 hover:text-zinc-100" : "text-zinc-600 hover:text-zinc-900"
              )} />
              <div>
                <h1 className={cn(
                  "text-2xl font-light tracking-wider",
                  isDark ? "text-zinc-100" : "text-zinc-800"
                )}>
                  BACKUPS
                </h1>
                <p className={cn(
                  "text-sm mt-1",
                  isDark ? "text-zinc-500" : "text-zinc-500"
                )}>
                  {server?.name || `Server ${serverId}`} - {backups.length} backup{backups.length !== 1 ? "s" : ""}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={openCreateModal}
                className={cn(
                  "transition-all gap-2",
                  isDark
                    ? "border-zinc-700 text-zinc-400 hover:text-zinc-100 hover:border-zinc-500"
                    : "border-zinc-300 text-zinc-600 hover:text-zinc-900 hover:border-zinc-400"
                )}
              >
                <BsPlus className="w-4 h-4" />
                <span className="text-xs uppercase tracking-wider">Create Backup</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setTheme(isDark ? "light" : "dark")}
                className={cn(
                  "transition-all hover:scale-110 active:scale-95 p-2",
                  isDark
                    ? "border-zinc-700 text-zinc-400 hover:text-zinc-100 hover:border-zinc-500"
                    : "border-zinc-300 text-zinc-600 hover:text-zinc-900 hover:border-zinc-400"
                )}
              >
                {isDark ? <BsSun className="w-4 h-4" /> : <BsMoon className="w-4 h-4" />}
              </Button>
            </div>
          </div>

          {/* Backup List */}
          <div className="space-y-4">
            {isLoading ? (
              <div className={cn(
                "text-center py-12 text-sm flex items-center justify-center gap-2",
                isDark ? "text-zinc-500" : "text-zinc-400"
              )}>
                <Spinner className="w-4 h-4" />
                Loading backups...
              </div>
            ) : backups.length === 0 ? (
              <div className={cn(
                "text-center py-12 border",
                isDark ? "border-zinc-800 text-zinc-500" : "border-zinc-200 text-zinc-400"
              )}>
                No backups found. Create your first backup.
              </div>
            ) : (
              <AnimatePresence mode="popLayout">
                {backups.map((backup) => (
                  <motion.div
                    key={backup.id}
                    layout
                    initial={{ opacity: 0, y: -20, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, x: -100, scale: 0.95 }}
                    transition={{ duration: 0.2, ease: "easeOut" }}
                    className={cn(
                      "relative p-6 border",
                      isDark
                        ? "bg-gradient-to-b from-[#141414] via-[#0f0f0f] to-[#0a0a0a] border-zinc-200/10 hover:border-zinc-700"
                        : "bg-gradient-to-b from-white via-zinc-50 to-zinc-100 border-zinc-300 hover:border-zinc-400"
                    )}
                  >
                    {/* Corner decorations */}
                    <div className={cn("absolute top-0 left-0 w-2 h-2 border-t border-l", isDark ? "border-zinc-500" : "border-zinc-400")} />
                    <div className={cn("absolute top-0 right-0 w-2 h-2 border-t border-r", isDark ? "border-zinc-500" : "border-zinc-400")} />
                    <div className={cn("absolute bottom-0 left-0 w-2 h-2 border-b border-l", isDark ? "border-zinc-500" : "border-zinc-400")} />
                    <div className={cn("absolute bottom-0 right-0 w-2 h-2 border-b border-r", isDark ? "border-zinc-500" : "border-zinc-400")} />

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <BsCheckCircle className="w-4 h-4 text-green-500" />
                        <div>
                          <div className="flex items-center gap-3">
                            <h3 className={cn(
                              "text-sm font-medium uppercase tracking-wider",
                              isDark ? "text-zinc-100" : "text-zinc-800"
                            )}>
                              {backup.name}
                            </h3>
                            {backup.locked && (
                              <span className={cn(
                                "text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 border flex items-center gap-1",
                                isDark ? "border-amber-500/50 text-amber-400" : "border-amber-400 text-amber-600"
                              )}>
                                <BsLock className="w-3 h-3" />
                                Locked
                              </span>
                            )}
                          </div>
                          <div className={cn(
                            "flex items-center gap-4 mt-1 text-xs",
                            isDark ? "text-zinc-500" : "text-zinc-500"
                          )}>
                            <span>{formatFileSize(backup.size)}</span>
                            <span>-</span>
                            <span>{new Date(backup.created_at).toLocaleString()}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleToggleLock(backup)}
                          className={cn(
                            "transition-all p-2",
                            isDark
                              ? "border-zinc-700 text-zinc-400 hover:text-zinc-100 hover:border-zinc-500"
                              : "border-zinc-300 text-zinc-600 hover:text-zinc-900 hover:border-zinc-400"
                          )}
                          title={backup.locked ? "Unlock backup" : "Lock backup"}
                        >
                          {backup.locked ? <BsUnlock className="w-4 h-4" /> : <BsLock className="w-4 h-4" />}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={async () => {
                            try {
                              const { downloadUrl } = await servers.backups.getDownloadToken(serverId, backup.id);
                              window.open(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"}${downloadUrl}`, "_blank");
                            } catch (error) {
                              toast.error("Failed to generate download link");
                            }
                          }}
                          className={cn(
                            "transition-all gap-2",
                            isDark
                              ? "border-zinc-700 text-zinc-400 hover:text-zinc-100 hover:border-zinc-500"
                              : "border-zinc-300 text-zinc-600 hover:text-zinc-900 hover:border-zinc-400"
                          )}
                          title="Download backup"
                        >
                          <BsDownload className="w-4 h-4" />
                          <span className="text-xs uppercase tracking-wider">Download</span>
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openRestoreModal(backup)}
                          className={cn(
                            "transition-all gap-2",
                            isDark
                              ? "border-zinc-700 text-zinc-400 hover:text-zinc-100 hover:border-zinc-500"
                              : "border-zinc-300 text-zinc-600 hover:text-zinc-900 hover:border-zinc-400"
                          )}
                        >
                          <BsCloudDownload className="w-4 h-4" />
                          <span className="text-xs uppercase tracking-wider">Restore</span>
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={backup.locked}
                          onClick={() => openDeleteModal(backup)}
                          className={cn(
                            "transition-all p-2",
                            backup.locked
                              ? "opacity-30 cursor-not-allowed"
                              : isDark
                                ? "border-red-900/60 text-red-400/80 hover:text-red-300 hover:border-red-700"
                                : "border-red-300 text-red-600 hover:text-red-700 hover:border-red-400"
                          )}
                        >
                          <BsTrash className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            )}
          </div>
        </div>
      </div>

      {/* Create Backup Modal */}
      <FormModal
        open={createModalOpen}
        onOpenChange={(open) => !isCreating && setCreateModalOpen(open)}
        title="Create Backup"
        description="Create a new manual backup of your server."
        onSubmit={handleCreate}
        submitLabel={isCreating ? "Creating..." : "Create Backup"}
        isDark={isDark}
        isValid={!isCreating}
      >
        <div className="space-y-4">
          <div>
            <label className={cn(
              "text-xs uppercase tracking-wider mb-2 block",
              isDark ? "text-zinc-400" : "text-zinc-600"
            )}>
              Backup Name (Optional)
            </label>
            <Input
              value={backupName}
              onChange={(e) => setBackupName(e.target.value)}
              placeholder="e.g., Pre-Update Backup"
              disabled={isCreating}
              className={cn(
                "transition-all",
                isDark
                  ? "bg-zinc-900 border-zinc-700 text-zinc-100 placeholder:text-zinc-600"
                  : "bg-white border-zinc-300 text-zinc-900 placeholder:text-zinc-400"
              )}
            />
            <p className={cn(
              "text-xs mt-1",
              isDark ? "text-zinc-500" : "text-zinc-500"
            )}>
              Leave empty for auto-generated name
            </p>
          </div>
        </div>
      </FormModal>

      {/* Restore Backup Modal */}
      <ConfirmationModal
        open={restoreModalOpen}
        onOpenChange={setRestoreModalOpen}
        title="Restore Backup"
        description={`Are you sure you want to restore "${selectedBackup?.name}"? This will replace your current server data with the backup contents.`}
        onConfirm={handleRestore}
        confirmLabel="Restore"
        variant="danger"
        isDark={isDark}
      />

      {/* Delete Backup Modal */}
      <ConfirmationModal
        open={deleteModalOpen}
        onOpenChange={setDeleteModalOpen}
        title="Delete Backup"
        description={`Are you sure you want to delete "${selectedBackup?.name}"? This action cannot be undone.`}
        onConfirm={handleDelete}
        confirmLabel="Delete"
        variant="danger"
        isDark={isDark}
      />
    </div>
  );
};

export default BackupsPage;
