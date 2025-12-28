"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { cn } from "@workspace/ui/lib/utils";
import { Button } from "@workspace/ui/components/button";
import { Spinner } from "@workspace/ui/components/spinner";
import { AnimatedBackground } from "@workspace/ui/components/shared/AnimatedBackground";
import { FadeIn, FloatingDots } from "@workspace/ui/components/shared/Animations";
import { ArrowLeftIcon, SaveIcon, RefreshCwIcon, PlusIcon, TrashIcon, NetworkIcon } from "lucide-react";
import { useServer, useServerMutations } from "@/hooks/queries";
import { useAdminTheme, CornerAccents } from "@/hooks/use-admin-theme";
import { ConfirmationModal } from "@workspace/ui/components/shared/ConfirmationModal";
import { toast } from "sonner";
import { servers, Allocation } from "@/lib/api";

export default function EditServerPage() {
  const router = useRouter();
  const params = useParams();
  const serverId = params.id as string;
  const { mounted, isDark, inputClasses, labelClasses } = useAdminTheme();

  // React Query hooks
  const { data: server, isLoading, refetch } = useServer(serverId);
  const { update, reinstall, setStatus } = useServerMutations();

  // Modal state
  const [reinstallModalOpen, setReinstallModalOpen] = useState(false);
  const [isReinstalling, setIsReinstalling] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<string>("");

  // Allocation state
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [availableAllocations, setAvailableAllocations] = useState<Allocation[]>([]);
  const [isLoadingAllocations, setIsLoadingAllocations] = useState(false);
  const [showAddAllocation, setShowAddAllocation] = useState(false);
  const [selectedAllocationId, setSelectedAllocationId] = useState<string>("");
  const [isAddingAllocation, setIsAddingAllocation] = useState(false);
  const [removingAllocationId, setRemovingAllocationId] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    memory: 1024,
    disk: 10240,
    cpu: 100,
    cpuPinning: "",
    swap: -1,
    oomKillDisable: false,
    backupLimit: 3,
  });

  // Initialize form data and status when server data loads
  useEffect(() => {
    if (server) {
      setSelectedStatus(server.status);
      setFormData({
        name: server.name,
        description: server.description || "",
        memory: server.memory,
        disk: server.disk,
        cpu: server.cpu,
        cpuPinning: server.cpuPinning || "",
        swap: server.swap,
        oomKillDisable: server.oomKillDisable,
        backupLimit: server.backupLimit,
      });
      // Set initial allocations from server data
      if (server.allocations) {
        setAllocations(server.allocations);
      }
    }
  }, [server]);

  // Load allocations
  const loadAllocations = async () => {
    if (!serverId) return;
    setIsLoadingAllocations(true);
    try {
      const allocs = await servers.allocations.list(serverId);
      setAllocations(allocs);
    } catch (error: any) {
      toast.error("Failed to load allocations");
    } finally {
      setIsLoadingAllocations(false);
    }
  };

  // Load available allocations when showing add dialog
  const loadAvailableAllocations = async () => {
    if (!serverId) return;
    try {
      const available = await servers.allocations.available(serverId);
      setAvailableAllocations(available);
    } catch (error: any) {
      toast.error("Failed to load available allocations");
    }
  };

  // Add allocation to server
  const handleAddAllocation = async () => {
    if (!serverId || !selectedAllocationId) return;
    setIsAddingAllocation(true);
    try {
      await servers.allocations.add(serverId, selectedAllocationId);
      toast.success("Allocation added successfully");
      setShowAddAllocation(false);
      setSelectedAllocationId("");
      loadAllocations();
    } catch (error: any) {
      toast.error(error.message || "Failed to add allocation");
    } finally {
      setIsAddingAllocation(false);
    }
  };

  // Remove allocation from server
  const handleRemoveAllocation = async (allocationId: string) => {
    if (!serverId) return;
    setRemovingAllocationId(allocationId);
    try {
      await servers.allocations.remove(serverId, allocationId);
      toast.success("Allocation removed successfully");
      loadAllocations();
    } catch (error: any) {
      toast.error(error.message || "Failed to remove allocation");
    } finally {
      setRemovingAllocationId(null);
    }
  };

  const handleReinstall = async () => {
    setIsReinstalling(true);
    try {
      await reinstall.mutateAsync(serverId);
      toast.success("Server reinstall initiated");
      setReinstallModalOpen(false);
      refetch();
    } catch (error: any) {
      toast.error(error.message || "Failed to reinstall server");
    } finally {
      setIsReinstalling(false);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    try {
      await setStatus.mutateAsync({ id: serverId, status: newStatus });
      toast.success(`Server status set to ${newStatus}`);
      setSelectedStatus(newStatus);
      refetch();
    } catch (error: any) {
      toast.error(error.message || "Failed to update server status");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      await update.mutateAsync({
        id: serverId,
        data: {
          name: formData.name,
          description: formData.description || undefined,
          memory: formData.memory,
          disk: formData.disk,
          cpu: formData.cpu,
          cpuPinning: formData.cpuPinning || undefined,
          swap: formData.swap,
          oomKillDisable: formData.oomKillDisable,
          backupLimit: formData.backupLimit,
        },
      });
      toast.success("Server updated successfully");
      router.push("/admin/servers");
    } catch (error: any) {
      toast.error(error.message || "Failed to update server");
    }
  };

  if (!mounted) return null;

  if (isLoading) {
    return (
      <div className={cn("min-h-svh flex items-center justify-center relative", isDark ? "bg-[#0b0b0a]" : "bg-[#f5f5f4]")}>
        <AnimatedBackground isDark={isDark} />
        <Spinner className="w-6 h-6" />
      </div>
    );
  }

  return (
    <div className={cn("min-h-svh transition-colors relative", isDark ? "bg-[#0b0b0a]" : "bg-[#f5f5f4]")}>
      <AnimatedBackground isDark={isDark} />
      <FloatingDots isDark={isDark} count={15} />

      <div className="relative p-8">
        <div className="max-w-2xl mx-auto">
          <FadeIn delay={0}>
            {/* Header */}
            <div className="flex items-center gap-4 mb-8">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.push("/admin/servers")}
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
                  EDIT SERVER
                </h1>
                <p className={cn(
                  "text-sm mt-1",
                  isDark ? "text-zinc-500" : "text-zinc-500"
                )}>
                  {server?.name} ({server?.shortId})
                </p>
              </div>
            </div>
          </FadeIn>

          <FadeIn delay={0.1}>
            <form onSubmit={handleSubmit}>
              <div className={cn(
                "relative p-6 border",
                isDark
                  ? "bg-gradient-to-b from-[#141414] via-[#0f0f0f] to-[#0a0a0a] border-zinc-200/10 shadow-lg shadow-black/20"
                  : "bg-gradient-to-b from-white via-zinc-50 to-zinc-100 border-zinc-300 shadow-lg shadow-zinc-400/20"
              )}>
                <CornerAccents isDark={isDark} size="sm" />

                <div className="space-y-4">
                  {/* Basic Info */}
                  <div>
                    <label className={labelClasses}>Name</label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className={inputClasses}
                      required
                    />
                  </div>

                  <div>
                    <label className={labelClasses}>Description</label>
                    <textarea
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      className={cn(inputClasses, "resize-none h-20")}
                      placeholder="Optional description..."
                    />
                  </div>

                  {/* Resources */}
                  <div className={cn("pt-4 border-t", isDark ? "border-zinc-700/50" : "border-zinc-200")}>
                    <h3 className={cn("text-sm font-medium uppercase tracking-wider mb-4", isDark ? "text-zinc-300" : "text-zinc-700")}>
                      Resources
                    </h3>

                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <label className={labelClasses}>CPU (%)</label>
                        <input
                          type="number"
                          value={formData.cpu}
                          onChange={(e) => setFormData({ ...formData, cpu: parseInt(e.target.value) || 100 })}
                          className={inputClasses}
                          min={1}
                          step={1}
                          required
                        />
                        <p className={cn("text-xs mt-1", isDark ? "text-zinc-600" : "text-zinc-400")}>
                          100 = 1 thread
                        </p>
                      </div>
                      <div>
                        <label className={labelClasses}>Memory (MiB)</label>
                        <input
                          type="number"
                          value={formData.memory}
                          onChange={(e) => setFormData({ ...formData, memory: parseInt(e.target.value) || 1024 })}
                          className={inputClasses}
                          min={128}
                          step={128}
                          required
                        />
                      </div>
                      <div>
                        <label className={labelClasses}>Disk (MiB)</label>
                        <input
                          type="number"
                          value={formData.disk}
                          onChange={(e) => setFormData({ ...formData, disk: parseInt(e.target.value) || 1024 })}
                          className={inputClasses}
                          min={1024}
                          step={1024}
                          required
                        />
                      </div>
                    </div>
                  </div>

                  {/* Advanced */}
                  <div className={cn("pt-4 border-t", isDark ? "border-zinc-700/50" : "border-zinc-200")}>
                    <h3 className={cn("text-sm font-medium uppercase tracking-wider mb-4", isDark ? "text-zinc-300" : "text-zinc-700")}>
                      Advanced
                    </h3>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className={labelClasses}>CPU Pinning</label>
                        <input
                          type="text"
                          value={formData.cpuPinning}
                          onChange={(e) => setFormData({ ...formData, cpuPinning: e.target.value })}
                          className={inputClasses}
                          placeholder="e.g., 0,1,2,3 or 0-3"
                        />
                      </div>
                      <div>
                        <label className={labelClasses}>Swap (MiB)</label>
                        <input
                          type="number"
                          value={formData.swap}
                          onChange={(e) => setFormData({ ...formData, swap: parseInt(e.target.value) })}
                          className={inputClasses}
                        />
                        <p className={cn("text-xs mt-1", isDark ? "text-zinc-600" : "text-zinc-400")}>
                          -1 = unlimited, 0 = disabled
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mt-4">
                      <div>
                        <label className={labelClasses}>Backup Limit</label>
                        <input
                          type="number"
                          value={formData.backupLimit}
                          onChange={(e) => setFormData({ ...formData, backupLimit: parseInt(e.target.value) || 0 })}
                          className={inputClasses}
                          min={0}
                        />
                      </div>
                      <div className="flex items-center gap-3 pt-6">
                        <input
                          type="checkbox"
                          id="oomKillDisable"
                          checked={formData.oomKillDisable}
                          onChange={(e) => setFormData({ ...formData, oomKillDisable: e.target.checked })}
                          className="w-4 h-4"
                        />
                        <label htmlFor="oomKillDisable" className={cn("text-sm", isDark ? "text-zinc-300" : "text-zinc-700")}>
                          Disable OOM Killer
                        </label>
                      </div>
                    </div>
                  </div>

                  {/* Server Management */}
                  <div className={cn("pt-4 border-t", isDark ? "border-zinc-700/50" : "border-zinc-200")}>
                    <h3 className={cn("text-sm font-medium uppercase tracking-wider mb-4", isDark ? "text-zinc-300" : "text-zinc-700")}>
                      Server Management
                    </h3>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className={labelClasses}>Server Status</label>
                        <select
                          value={selectedStatus}
                          onChange={(e) => handleStatusChange(e.target.value)}
                          className={inputClasses}
                          disabled={setStatus.isPending}
                        >
                          <option value="STOPPED">Stopped</option>
                          <option value="RUNNING">Running</option>
                          <option value="STARTING">Starting</option>
                          <option value="STOPPING">Stopping</option>
                          <option value="INSTALLING">Installing</option>
                          <option value="ERROR">Error</option>
                        </select>
                        <p className={cn("text-xs mt-1", isDark ? "text-zinc-600" : "text-zinc-400")}>
                          Manually override server status
                        </p>
                      </div>
                      <div className="pt-6">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setReinstallModalOpen(true)}
                          className={cn(
                            "w-full flex items-center justify-center gap-2 text-xs uppercase tracking-wider transition-all hover:scale-[1.02] active:scale-95",
                            isDark
                              ? "border-amber-700/50 text-amber-400 hover:border-amber-500 hover:text-amber-300"
                              : "border-amber-400 text-amber-600 hover:border-amber-500"
                          )}
                        >
                          <RefreshCwIcon className="w-4 h-4" />
                          Reinstall Server
                        </Button>
                        <p className={cn("text-xs mt-1 text-center", isDark ? "text-zinc-600" : "text-zinc-400")}>
                          Wipes server and runs install script
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Allocations */}
                  <div className={cn("pt-4 border-t", isDark ? "border-zinc-700/50" : "border-zinc-200")}>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className={cn("text-sm font-medium uppercase tracking-wider", isDark ? "text-zinc-300" : "text-zinc-700")}>
                        Allocations
                      </h3>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setShowAddAllocation(true);
                          loadAvailableAllocations();
                        }}
                        className={cn(
                          "flex items-center gap-1 text-xs",
                          isDark
                            ? "border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
                            : "border-zinc-300 text-zinc-600 hover:border-zinc-400"
                        )}
                      >
                        <PlusIcon className="w-3 h-3" />
                        Add
                      </Button>
                    </div>

                    {/* Current allocations list */}
                    <div className="space-y-2">
                      {isLoadingAllocations ? (
                        <div className="flex items-center justify-center py-4">
                          <Spinner className="w-4 h-4" />
                        </div>
                      ) : allocations.length === 0 ? (
                        <p className={cn("text-sm py-4 text-center", isDark ? "text-zinc-500" : "text-zinc-400")}>
                          No allocations assigned
                        </p>
                      ) : (
                        allocations.map((allocation, index) => (
                          <div
                            key={allocation.id}
                            className={cn(
                              "flex items-center justify-between p-3 border",
                              isDark
                                ? "bg-zinc-900/50 border-zinc-800"
                                : "bg-zinc-50 border-zinc-200"
                            )}
                          >
                            <div className="flex items-center gap-3">
                              <NetworkIcon className={cn("w-4 h-4", isDark ? "text-zinc-500" : "text-zinc-400")} />
                              <span className={cn("font-mono text-sm", isDark ? "text-zinc-200" : "text-zinc-700")}>
                                {allocation.ip}:{allocation.port}
                              </span>
                              {index === 0 && (
                                <span className={cn(
                                  "px-2 py-0.5 text-[10px] uppercase tracking-wider font-medium",
                                  isDark
                                    ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                                    : "bg-emerald-100 text-emerald-700 border border-emerald-200"
                                )}>
                                  Primary
                                </span>
                              )}
                              {allocation.alias && (
                                <span className={cn("text-xs", isDark ? "text-zinc-500" : "text-zinc-400")}>
                                  ({allocation.alias})
                                </span>
                              )}
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              disabled={index === 0 || removingAllocationId === allocation.id}
                              onClick={() => handleRemoveAllocation(allocation.id)}
                              className={cn(
                                "p-1 h-auto",
                                index === 0
                                  ? "opacity-30 cursor-not-allowed"
                                  : isDark
                                    ? "text-zinc-500 hover:text-red-400 hover:bg-red-500/10"
                                    : "text-zinc-400 hover:text-red-600 hover:bg-red-50"
                              )}
                              title={index === 0 ? "Cannot remove primary allocation" : "Remove allocation"}
                            >
                              {removingAllocationId === allocation.id ? (
                                <Spinner className="w-4 h-4" />
                              ) : (
                                <TrashIcon className="w-4 h-4" />
                              )}
                            </Button>
                          </div>
                        ))
                      )}
                    </div>

                    {/* Add allocation dialog */}
                    {showAddAllocation && (
                      <div className={cn(
                        "mt-4 p-4 border",
                        isDark
                          ? "bg-zinc-900/50 border-zinc-700"
                          : "bg-zinc-50 border-zinc-200"
                      )}>
                        <p className={cn("text-sm mb-3", isDark ? "text-zinc-300" : "text-zinc-600")}>
                          Select an available allocation to add:
                        </p>
                        <select
                          value={selectedAllocationId}
                          onChange={(e) => setSelectedAllocationId(e.target.value)}
                          className={inputClasses}
                        >
                          <option value="">Select allocation...</option>
                          {availableAllocations.map((alloc) => (
                            <option key={alloc.id} value={alloc.id}>
                              {alloc.ip}:{alloc.port}{alloc.alias ? ` (${alloc.alias})` : ""}
                            </option>
                          ))}
                        </select>
                        {availableAllocations.length === 0 && (
                          <p className={cn("text-xs mt-2", isDark ? "text-zinc-500" : "text-zinc-400")}>
                            No available allocations on this node
                          </p>
                        )}
                        <div className="flex items-center gap-2 mt-3">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setShowAddAllocation(false);
                              setSelectedAllocationId("");
                            }}
                            className={cn(
                              "text-xs",
                              isDark ? "border-zinc-700 text-zinc-400" : "border-zinc-300 text-zinc-600"
                            )}
                          >
                            Cancel
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            disabled={!selectedAllocationId || isAddingAllocation}
                            onClick={handleAddAllocation}
                            className={cn(
                              "text-xs",
                              isDark
                                ? "bg-zinc-100 text-zinc-900 hover:bg-zinc-200"
                                : "bg-zinc-800 text-zinc-100 hover:bg-zinc-700"
                            )}
                          >
                            {isAddingAllocation ? (
                              <>
                                <Spinner className="w-3 h-3 mr-1" />
                                Adding...
                              </>
                            ) : (
                              "Add Allocation"
                            )}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Submit Button */}
              <div className="flex justify-end gap-3 mt-6">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.push("/admin/servers")}
                  className={cn(
                    "text-xs uppercase tracking-wider transition-all hover:scale-[1.02] active:scale-95",
                    isDark ? "border-zinc-700 text-zinc-400" : "border-zinc-300 text-zinc-600"
                  )}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={update.isPending}
                  className={cn(
                    "flex items-center gap-2 text-xs uppercase tracking-wider transition-all hover:scale-[1.02] active:scale-95",
                    isDark
                      ? "bg-zinc-100 text-zinc-900 hover:bg-zinc-200"
                      : "bg-zinc-800 text-zinc-100 hover:bg-zinc-700"
                  )}
                >
                  {update.isPending ? (
                    <Spinner className="w-4 h-4" />
                  ) : (
                    <SaveIcon className="w-4 h-4" />
                  )}
                  {update.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </form>
          </FadeIn>
        </div>
      </div>

      {/* Reinstall Confirmation Modal */}
      <ConfirmationModal
        open={reinstallModalOpen}
        onOpenChange={setReinstallModalOpen}
        onConfirm={handleReinstall}
        isDark={isDark}
        title="Reinstall Server"
        description="This will completely wipe the server's files and run the installation script again. All data will be lost. This action cannot be undone."
        confirmLabel={isReinstalling ? "Reinstalling..." : "Reinstall"}
        variant="danger"
        isLoading={isReinstalling}
      />
    </div>
  );
}
