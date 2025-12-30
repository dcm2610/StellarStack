"use client";

import { useState, useEffect, type JSX } from "react";
import { useParams } from "next/navigation";
import { useTheme as useNextTheme } from "next-themes";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@workspace/ui/lib/utils";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { SidebarTrigger } from "@workspace/ui/components/sidebar";
import { ConfirmationModal } from "@workspace/ui/components/confirmation-modal";
import { FormModal } from "@workspace/ui/components/form-modal";
import { Spinner } from "@workspace/ui/components/spinner";
import {
  BsSun,
  BsMoon,
  BsCloudDownload,
  BsDownload,
  BsTrash,
  BsPlus,
  BsCheckCircle,
  BsLock,
  BsUnlock,
} from "react-icons/bs";
import { useBackups, useBackupMutations } from "@/hooks/queries";
import type { Backup } from "@/lib/api";
import { useServer } from "@/components/server-provider";
import { ServerInstallingPlaceholder } from "@/components/server-installing-placeholder";
import { toast } from "sonner";

const BackupsPage = (): JSX.Element | null => {
  const params = useParams();
  const serverId = params.id as string;
  const { server, isInstalling } = useServer();
  const { setTheme, resolvedTheme } = useNextTheme();
  const [mounted, setMounted] = useState(false);

  // React Query hooks
  const { data: backups = [], isLoading } = useBackups(serverId);
  const { create, remove, restore, lock, getDownloadToken } = useBackupMutations(serverId);

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

  const isDark = mounted ? resolvedTheme === "dark" : true;

  // Check if a backup is currently in progress
  const isBackupInProgress = backups.some(
    (b) => b.status === "IN_PROGRESS" || b.status === "RESTORING"
  );

  // Backup limit from server
  const backupLimit = server?.backupLimit ?? 0;
  const backupsDisabled = backupLimit === 0;
  const completedBackups = backups.filter((b) => b.status === "COMPLETED").length;
  const canCreateBackup = !backupsDisabled && !isBackupInProgress && completedBackups < backupLimit;

  if (!mounted) return null;

  if (isInstalling) {
    return (
      <div className="min-h-svh">
        <ServerInstallingPlaceholder isDark={isDark} serverName={server?.name} />
      </div>
    );
  }

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
    // Close modal immediately
    setCreateModalOpen(false);
    const name = backupName || `Backup ${new Date().toLocaleDateString()}`;
    setBackupName("");

    toast.loading("Creating backup...", { id: "backup-create" });

    try {
      await create.mutateAsync({
        name: name,
      });
      toast.success("Backup created", { id: "backup-create" });
    } catch (error) {
      toast.error("Failed to create backup", { id: "backup-create" });
    }
  };

  const handleDelete = async () => {
    if (!selectedBackup) return;
    try {
      await remove.mutateAsync(selectedBackup.id);
      toast.success("Backup deleted");
      setDeleteModalOpen(false);
      setSelectedBackup(null);
    } catch (error) {
      toast.error("Failed to delete backup");
    }
  };

  const handleRestore = async () => {
    if (!selectedBackup) return;
    try {
      await restore.mutateAsync(selectedBackup.id);
      toast.success("Backup restored");
      setRestoreModalOpen(false);
      setSelectedBackup(null);
    } catch (error) {
      toast.error("Failed to restore backup");
    }
  };

  const handleToggleLock = async (backup: Backup) => {
    try {
      await lock.mutateAsync({ backupId: backup.id, locked: !backup.isLocked });
      toast.success(backup.isLocked ? "Backup unlocked" : "Backup locked");
    } catch (error) {
      toast.error("Failed to update backup");
    }
  };

  const handleDownload = async (backup: Backup) => {
    try {
      const { downloadUrl } = await getDownloadToken.mutateAsync(backup.id);
      window.open(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"}${downloadUrl}`,
        "_blank"
      );
    } catch (error) {
      toast.error("Failed to generate download link");
    }
  };

  const getStatusIcon = (status: Backup["status"]) => {
    switch (status) {
      case "COMPLETED":
        return <BsCheckCircle className="h-4 w-4 text-green-500" />;
      case "IN_PROGRESS":
        return <Spinner className="h-4 w-4" />;
      case "RESTORING":
        return <BsCloudDownload className="h-4 w-4 text-amber-500" />;
      case "FAILED":
        return <BsTrash className="h-4 w-4 text-red-500" />;
      default:
        return <BsCheckCircle className="h-4 w-4 text-green-500" />;
    }
  };

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
                  BACKUPS
                </h1>
                <p className={cn("mt-1 text-sm", isDark ? "text-zinc-500" : "text-zinc-500")}>
                  {server?.name || `Server ${serverId}`} • {completedBackups} / {backupLimit} backup
                  {backupLimit !== 1 ? "s" : ""} used
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {!backupsDisabled && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={openCreateModal}
                  disabled={!canCreateBackup}
                  title={
                    isBackupInProgress
                      ? "A backup is currently in progress"
                      : completedBackups >= backupLimit
                        ? "Backup limit reached"
                        : "Create a new backup"
                  }
                  className={cn(
                    "gap-2 transition-all",
                    !canCreateBackup && "cursor-not-allowed opacity-50",
                    isDark
                      ? "border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-100"
                      : "border-zinc-300 text-zinc-600 hover:border-zinc-400 hover:text-zinc-900"
                  )}
                >
                  <BsPlus className="h-4 w-4" />
                  <span className="text-xs tracking-wider uppercase">Create Backup</span>
                </Button>
              )}
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
          </div>

          {/* Backup List */}
          <div className="space-y-4">
            {isLoading ? (
              <div
                className={cn(
                  "flex items-center justify-center gap-2 py-12 text-center text-sm",
                  isDark ? "text-zinc-500" : "text-zinc-400"
                )}
              >
                <Spinner className="h-4 w-4" />
                Loading backups...
              </div>
            ) : backupsDisabled ? (
              <div
                className={cn(
                  "border py-12 text-center",
                  isDark ? "border-zinc-800 text-zinc-500" : "border-zinc-200 text-zinc-400"
                )}
              >
                <p className="mb-2">Backups are not available for this server.</p>
                <p className="text-xs">Contact an administrator to enable backups.</p>
              </div>
            ) : backups.length === 0 ? (
              <div
                className={cn(
                  "border py-12 text-center",
                  isDark ? "border-zinc-800 text-zinc-500" : "border-zinc-200 text-zinc-400"
                )}
              >
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
                      "relative border p-6",
                      isDark
                        ? "border-zinc-200/10 bg-gradient-to-b from-[#141414] via-[#0f0f0f] to-[#0a0a0a] hover:border-zinc-700"
                        : "border-zinc-300 bg-gradient-to-b from-white via-zinc-50 to-zinc-100 hover:border-zinc-400"
                    )}
                  >
                    {/* Corner decorations */}
                    <div
                      className={cn(
                        "absolute top-0 left-0 h-2 w-2 border-t border-l",
                        isDark ? "border-zinc-500" : "border-zinc-400"
                      )}
                    />
                    <div
                      className={cn(
                        "absolute top-0 right-0 h-2 w-2 border-t border-r",
                        isDark ? "border-zinc-500" : "border-zinc-400"
                      )}
                    />
                    <div
                      className={cn(
                        "absolute bottom-0 left-0 h-2 w-2 border-b border-l",
                        isDark ? "border-zinc-500" : "border-zinc-400"
                      )}
                    />
                    <div
                      className={cn(
                        "absolute right-0 bottom-0 h-2 w-2 border-r border-b",
                        isDark ? "border-zinc-500" : "border-zinc-400"
                      )}
                    />

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        {getStatusIcon(backup.status)}
                        <div>
                          <div className="flex items-center gap-3">
                            <h3
                              className={cn(
                                "text-sm font-medium tracking-wider uppercase",
                                isDark ? "text-zinc-100" : "text-zinc-800"
                              )}
                            >
                              {backup.name}
                            </h3>
                            {backup.isLocked && (
                              <span
                                className={cn(
                                  "flex items-center gap-1 border px-2 py-0.5 text-[10px] font-medium tracking-wider uppercase",
                                  isDark
                                    ? "border-amber-500/50 text-amber-400"
                                    : "border-amber-400 text-amber-600"
                                )}
                              >
                                <BsLock className="h-3 w-3" />
                                Locked
                              </span>
                            )}
                            {backup.status !== "COMPLETED" && (
                              <span
                                className={cn(
                                  "border px-2 py-0.5 text-[10px] font-medium tracking-wider uppercase",
                                  backup.status === "IN_PROGRESS" &&
                                    (isDark
                                      ? "border-blue-500/50 text-blue-400"
                                      : "border-blue-400 text-blue-600"),
                                  backup.status === "RESTORING" &&
                                    (isDark
                                      ? "border-amber-500/50 text-amber-400"
                                      : "border-amber-400 text-amber-600"),
                                  backup.status === "FAILED" &&
                                    (isDark
                                      ? "border-red-500/50 text-red-400"
                                      : "border-red-400 text-red-600")
                                )}
                              >
                                {backup.status.replace("_", " ")}
                              </span>
                            )}
                          </div>
                          <div
                            className={cn(
                              "mt-1 flex items-center gap-4 text-xs",
                              isDark ? "text-zinc-500" : "text-zinc-500"
                            )}
                          >
                            <span>{formatFileSize(backup.size)}</span>
                            <span>-</span>
                            <span>{new Date(backup.createdAt).toLocaleString()}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleToggleLock(backup)}
                          disabled={lock.isPending}
                          className={cn(
                            "p-2 transition-all",
                            isDark
                              ? "border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-100"
                              : "border-zinc-300 text-zinc-600 hover:border-zinc-400 hover:text-zinc-900"
                          )}
                          title={backup.isLocked ? "Unlock backup" : "Lock backup"}
                        >
                          {backup.isLocked ? (
                            <BsUnlock className="h-4 w-4" />
                          ) : (
                            <BsLock className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDownload(backup)}
                          disabled={getDownloadToken.isPending}
                          className={cn(
                            "gap-2 transition-all",
                            isDark
                              ? "border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-100"
                              : "border-zinc-300 text-zinc-600 hover:border-zinc-400 hover:text-zinc-900"
                          )}
                          title="Download backup"
                        >
                          <BsDownload className="h-4 w-4" />
                          <span className="text-xs tracking-wider uppercase">Download</span>
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openRestoreModal(backup)}
                          className={cn(
                            "gap-2 transition-all",
                            isDark
                              ? "border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-100"
                              : "border-zinc-300 text-zinc-600 hover:border-zinc-400 hover:text-zinc-900"
                          )}
                        >
                          <BsCloudDownload className="h-4 w-4" />
                          <span className="text-xs tracking-wider uppercase">Restore</span>
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={backup.isLocked}
                          onClick={() => openDeleteModal(backup)}
                          className={cn(
                            "p-2 transition-all",
                            backup.isLocked
                              ? "cursor-not-allowed opacity-30"
                              : isDark
                                ? "border-red-900/60 text-red-400/80 hover:border-red-700 hover:text-red-300"
                                : "border-red-300 text-red-600 hover:border-red-400 hover:text-red-700"
                          )}
                        >
                          <BsTrash className="h-4 w-4" />
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
        onOpenChange={(open) => !create.isPending && setCreateModalOpen(open)}
        title="Create Backup"
        description="Create a new manual backup of your server."
        onSubmit={handleCreate}
        submitLabel={create.isPending ? "Creating..." : "Create Backup"}
        isDark={isDark}
        isValid={!create.isPending}
        isLoading={create.isPending}
      >
        <div className="space-y-4">
          <div>
            <label
              className={cn(
                "mb-2 block text-xs tracking-wider uppercase",
                isDark ? "text-zinc-400" : "text-zinc-600"
              )}
            >
              Backup Name (Optional)
            </label>
            <Input
              value={backupName}
              onChange={(e) => setBackupName(e.target.value)}
              placeholder="e.g., Pre-Update Backup"
              disabled={create.isPending}
              className={cn(
                "transition-all",
                isDark
                  ? "border-zinc-700 bg-zinc-900 text-zinc-100 placeholder:text-zinc-600"
                  : "border-zinc-300 bg-white text-zinc-900 placeholder:text-zinc-400"
              )}
            />
            <p className={cn("mt-1 text-xs", isDark ? "text-zinc-500" : "text-zinc-500")}>
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
        isLoading={restore.isPending}
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
        isLoading={remove.isPending}
      />
    </div>
  );
};

export default BackupsPage;
