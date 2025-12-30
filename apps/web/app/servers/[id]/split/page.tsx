"use client";

import { useState, useEffect, type JSX } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTheme as useNextTheme } from "next-themes";
import { cn } from "@workspace/ui/lib/utils";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { SidebarTrigger } from "@workspace/ui/components/sidebar";
import { ConfirmationModal } from "@workspace/ui/components/confirmation-modal";
import { FormModal } from "@workspace/ui/components/form-modal";
import {
  BsSun,
  BsMoon,
  BsPlus,
  BsTrash,
  BsServer,
  BsExclamationTriangle,
  BsArrowRight,
  BsMemory,
  BsHdd,
  BsCpu,
} from "react-icons/bs";
import { useServer } from "@/components/server-provider";
import { ServerInstallingPlaceholder } from "@/components/server-installing-placeholder";
import { servers, type ChildServer } from "@/lib/api";
import { toast } from "sonner";

// Format MiB values (memory/disk are stored in MiB in the database)
const formatMiB = (mib: number): string => {
  if (mib === 0) return "0 MiB";
  if (mib < 1024) return `${mib} MiB`;
  const gib = mib / 1024;
  if (gib < 1024) return `${gib.toFixed(2)} GiB`;
  const tib = gib / 1024;
  return `${tib.toFixed(2)} TiB`;
};

const SplitPage = (): JSX.Element | null => {
  const params = useParams();
  const router = useRouter();
  const serverId = params.id as string;
  const { server, isInstalling, refetch } = useServer();
  const { setTheme, resolvedTheme } = useNextTheme();
  const [mounted, setMounted] = useState(false);
  const [children, setChildren] = useState<ChildServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [splitting, setSplitting] = useState(false);

  // Modal states
  const [splitModalOpen, setSplitModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [selectedChild, setSelectedChild] = useState<ChildServer | null>(null);

  // Form states
  const [formName, setFormName] = useState("");
  const [formMemoryPercent, setFormMemoryPercent] = useState(25);
  const [formDiskPercent, setFormDiskPercent] = useState(25);
  const [formCpuPercent, setFormCpuPercent] = useState(25);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (serverId) {
      fetchChildren();
    }
  }, [serverId]);

  const fetchChildren = async () => {
    try {
      setLoading(true);
      const data = await servers.split.children(serverId);
      setChildren(data);
    } catch (error) {
      console.error("Failed to fetch child servers:", error);
    } finally {
      setLoading(false);
    }
  };

  const isDark = mounted ? resolvedTheme === "dark" : true;

  if (!mounted) return null;

  if (isInstalling) {
    return (
      <div className="min-h-svh">
        {/* Background is now rendered in the layout for persistence */}
        <ServerInstallingPlaceholder isDark={isDark} serverName={server?.name} />
      </div>
    );
  }

  const isChildServer = server?.parentServerId != null;
  const parentMemory = Number(server?.memory || 0);
  const parentDisk = Number(server?.disk || 0);
  const parentCpu = server?.cpu || 0;

  // Calculate what the child would get
  const childMemory = Math.floor((parentMemory * formMemoryPercent) / 100);
  const childDisk = Math.floor((parentDisk * formDiskPercent) / 100);
  const childCpu = Math.floor((parentCpu * formCpuPercent) / 100);

  // Calculate what would remain for parent
  const remainingMemory = parentMemory - childMemory;
  const remainingDisk = parentDisk - childDisk;
  const remainingCpu = parentCpu - childCpu;

  const resetForm = () => {
    setFormName("");
    setFormMemoryPercent(25);
    setFormDiskPercent(25);
    setFormCpuPercent(25);
  };

  const openSplitModal = () => {
    resetForm();
    setSplitModalOpen(true);
  };

  const openDeleteModal = (child: ChildServer) => {
    setSelectedChild(child);
    setDeleteModalOpen(true);
  };

  const handleSplit = async () => {
    if (!formName.trim()) {
      toast.error("Please enter a name for the child server");
      return;
    }

    setSplitting(true);
    try {
      const result = await servers.split.create(serverId, {
        name: formName,
        memoryPercent: formMemoryPercent,
        diskPercent: formDiskPercent,
        cpuPercent: formCpuPercent,
      });

      toast.success(`Child server "${result.childServer.name}" created`);
      setSplitModalOpen(false);
      resetForm();
      fetchChildren();
      refetch(); // Refresh parent server data
    } catch (error: any) {
      toast.error(error.message || "Failed to split server");
    } finally {
      setSplitting(false);
    }
  };

  const handleDeleteChild = async () => {
    if (!selectedChild) return;

    try {
      await servers.delete(selectedChild.id);
      toast.success("Child server deleted");
      setDeleteModalOpen(false);
      setSelectedChild(null);
      fetchChildren();
      refetch(); // Refresh parent to update resources
    } catch (error: any) {
      toast.error(error.message || "Failed to delete child server");
    }
  };

  const isFormValid =
    formName.trim().length > 0 &&
    formMemoryPercent >= 10 &&
    formMemoryPercent <= 90 &&
    formDiskPercent >= 10 &&
    formDiskPercent <= 90 &&
    formCpuPercent >= 10 &&
    formCpuPercent <= 90;

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
                  SERVER SPLITTING
                </h1>
                <p className={cn("mt-1 text-sm", isDark ? "text-zinc-500" : "text-zinc-500")}>
                  Server {serverId} • {children.length} child servers
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {!isChildServer && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={openSplitModal}
                  className={cn(
                    "gap-2 transition-all",
                    isDark
                      ? "border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-100"
                      : "border-zinc-300 text-zinc-600 hover:border-zinc-400 hover:text-zinc-900"
                  )}
                >
                  <BsPlus className="h-4 w-4" />
                  <span className="text-xs tracking-wider uppercase">Split Server</span>
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

          {/* Child Server Warning */}
          {isChildServer && (
            <div
              className={cn(
                "mb-6 flex items-center gap-3 border p-4",
                isDark
                  ? "border-amber-700/30 bg-amber-950/20 text-amber-200/80"
                  : "border-amber-200 bg-amber-50 text-amber-800"
              )}
            >
              <BsExclamationTriangle className="h-5 w-5 shrink-0" />
              <div>
                <p className="text-sm font-medium">This is a Child Server</p>
                <p
                  className={cn("mt-0.5 text-xs", isDark ? "text-amber-200/60" : "text-amber-600")}
                >
                  Child servers cannot be split further. Only parent servers can create child
                  servers.
                </p>
              </div>
            </div>
          )}

          {/* Current Resources */}
          {!isChildServer && (
            <div
              className={cn(
                "relative mb-6 border p-6",
                isDark
                  ? "border-zinc-200/10 bg-gradient-to-b from-[#141414] via-[#0f0f0f] to-[#0a0a0a]"
                  : "border-zinc-300 bg-gradient-to-b from-white via-zinc-50 to-zinc-100"
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

              <h3
                className={cn(
                  "mb-4 text-xs font-medium tracking-wider uppercase",
                  isDark ? "text-zinc-400" : "text-zinc-600"
                )}
              >
                Current Resources
              </h3>

              <div className="grid grid-cols-3 gap-6">
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      "flex h-10 w-10 items-center justify-center border",
                      isDark ? "border-zinc-700 bg-zinc-800/50" : "border-zinc-300 bg-zinc-100"
                    )}
                  >
                    <BsMemory
                      className={cn("h-5 w-5", isDark ? "text-blue-400" : "text-blue-600")}
                    />
                  </div>
                  <div>
                    <div
                      className={cn(
                        "text-xs tracking-wider uppercase",
                        isDark ? "text-zinc-500" : "text-zinc-500"
                      )}
                    >
                      Memory
                    </div>
                    <div
                      className={cn(
                        "text-lg font-light",
                        isDark ? "text-zinc-100" : "text-zinc-800"
                      )}
                    >
                      {formatMiB(parentMemory)}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      "flex h-10 w-10 items-center justify-center border",
                      isDark ? "border-zinc-700 bg-zinc-800/50" : "border-zinc-300 bg-zinc-100"
                    )}
                  >
                    <BsHdd
                      className={cn("h-5 w-5", isDark ? "text-green-400" : "text-green-600")}
                    />
                  </div>
                  <div>
                    <div
                      className={cn(
                        "text-xs tracking-wider uppercase",
                        isDark ? "text-zinc-500" : "text-zinc-500"
                      )}
                    >
                      Disk
                    </div>
                    <div
                      className={cn(
                        "text-lg font-light",
                        isDark ? "text-zinc-100" : "text-zinc-800"
                      )}
                    >
                      {formatMiB(parentDisk)}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      "flex h-10 w-10 items-center justify-center border",
                      isDark ? "border-zinc-700 bg-zinc-800/50" : "border-zinc-300 bg-zinc-100"
                    )}
                  >
                    <BsCpu
                      className={cn("h-5 w-5", isDark ? "text-amber-400" : "text-amber-600")}
                    />
                  </div>
                  <div>
                    <div
                      className={cn(
                        "text-xs tracking-wider uppercase",
                        isDark ? "text-zinc-500" : "text-zinc-500"
                      )}
                    >
                      CPU
                    </div>
                    <div
                      className={cn(
                        "text-lg font-light",
                        isDark ? "text-zinc-100" : "text-zinc-800"
                      )}
                    >
                      {parentCpu}%
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Loading State */}
          {loading ? (
            <div className={cn("py-12 text-center", isDark ? "text-zinc-500" : "text-zinc-400")}>
              Loading child servers...
            </div>
          ) : children.length === 0 ? (
            <div
              className={cn(
                "relative border p-8 text-center",
                isDark
                  ? "border-zinc-200/10 bg-gradient-to-b from-[#141414] via-[#0f0f0f] to-[#0a0a0a]"
                  : "border-zinc-300 bg-gradient-to-b from-white via-zinc-50 to-zinc-100"
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

              <BsServer
                className={cn("mx-auto mb-4 h-12 w-12", isDark ? "text-zinc-600" : "text-zinc-400")}
              />
              <h3
                className={cn(
                  "mb-2 text-lg font-medium",
                  isDark ? "text-zinc-300" : "text-zinc-700"
                )}
              >
                No Child Servers
              </h3>
              <p className={cn("mb-4 text-sm", isDark ? "text-zinc-500" : "text-zinc-500")}>
                {isChildServer
                  ? "Child servers cannot have their own children."
                  : "Split this server to create child servers with dedicated resources."}
              </p>
              {!isChildServer && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={openSplitModal}
                  className={cn(
                    "gap-2",
                    isDark
                      ? "border-zinc-700 text-zinc-400 hover:text-zinc-100"
                      : "border-zinc-300 text-zinc-600 hover:text-zinc-900"
                  )}
                >
                  <BsPlus className="h-4 w-4" />
                  Split Server
                </Button>
              )}
            </div>
          ) : (
            /* Child Servers List */
            <div className="space-y-4">
              <h3
                className={cn(
                  "text-xs font-medium tracking-wider uppercase",
                  isDark ? "text-zinc-400" : "text-zinc-600"
                )}
              >
                Child Servers
              </h3>
              {children.map((child) => (
                <div
                  key={child.id}
                  className={cn(
                    "relative border p-6 transition-all",
                    isDark
                      ? "border-zinc-200/10 bg-gradient-to-b from-[#141414] via-[#0f0f0f] to-[#0a0a0a]"
                      : "border-zinc-300 bg-gradient-to-b from-white via-zinc-50 to-zinc-100"
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
                      <div
                        className={cn(
                          "flex h-10 w-10 items-center justify-center border",
                          isDark ? "border-zinc-700 bg-zinc-800/50" : "border-zinc-300 bg-zinc-100"
                        )}
                      >
                        <BsServer
                          className={cn("h-5 w-5", isDark ? "text-zinc-400" : "text-zinc-500")}
                        />
                      </div>
                      <div>
                        <div className="flex items-center gap-3">
                          <h3
                            className={cn(
                              "text-sm font-medium tracking-wider uppercase",
                              isDark ? "text-zinc-100" : "text-zinc-800"
                            )}
                          >
                            {child.name}
                          </h3>
                          <span
                            className={cn(
                              "border px-2 py-0.5 text-[10px] font-medium tracking-wider uppercase",
                              child.status === "RUNNING"
                                ? isDark
                                  ? "border-green-700/50 text-green-400"
                                  : "border-green-300 text-green-600"
                                : child.status === "STOPPED"
                                  ? isDark
                                    ? "border-zinc-700 text-zinc-500"
                                    : "border-zinc-300 text-zinc-500"
                                  : isDark
                                    ? "border-amber-700/50 text-amber-400"
                                    : "border-amber-300 text-amber-600"
                            )}
                          >
                            {child.status}
                          </span>
                        </div>
                        <div
                          className={cn(
                            "mt-1 flex items-center gap-4 text-xs",
                            isDark ? "text-zinc-500" : "text-zinc-500"
                          )}
                        >
                          <span>{formatMiB(child.memory)} RAM</span>
                          <span>•</span>
                          <span>{formatMiB(child.disk)} Disk</span>
                          <span>•</span>
                          <span>{child.cpu}% CPU</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => router.push(`/servers/${child.id}/overview`)}
                        className={cn(
                          "gap-2 transition-all",
                          isDark
                            ? "border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-100"
                            : "border-zinc-300 text-zinc-600 hover:border-zinc-400 hover:text-zinc-900"
                        )}
                      >
                        <span className="text-xs tracking-wider uppercase">Manage</span>
                        <BsArrowRight className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openDeleteModal(child)}
                        className={cn(
                          "p-2 transition-all",
                          isDark
                            ? "border-red-900/60 text-red-400/80 hover:border-red-700 hover:text-red-300"
                            : "border-red-300 text-red-600 hover:border-red-400 hover:text-red-700"
                        )}
                      >
                        <BsTrash className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Split Server Modal */}
      <FormModal
        open={splitModalOpen}
        onOpenChange={setSplitModalOpen}
        title="Split Server"
        description="Create a child server by allocating a portion of this server's resources."
        onSubmit={handleSplit}
        submitLabel={splitting ? "Splitting..." : "Create Child Server"}
        isDark={isDark}
        isValid={isFormValid && !splitting}
      >
        <div className="space-y-6">
          <div>
            <label
              className={cn(
                "mb-2 block text-xs tracking-wider uppercase",
                isDark ? "text-zinc-400" : "text-zinc-600"
              )}
            >
              Child Server Name
            </label>
            <Input
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="Enter server name"
              className={cn(
                "transition-all",
                isDark
                  ? "border-zinc-700 bg-zinc-900 text-zinc-100 placeholder:text-zinc-600"
                  : "border-zinc-300 bg-white text-zinc-900 placeholder:text-zinc-400"
              )}
            />
          </div>

          {/* Resource Sliders */}
          <div className="space-y-4">
            {/* Memory */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <label
                  className={cn(
                    "text-xs tracking-wider uppercase",
                    isDark ? "text-zinc-400" : "text-zinc-600"
                  )}
                >
                  Memory ({formMemoryPercent}%)
                </label>
                <span className={cn("text-xs", isDark ? "text-zinc-500" : "text-zinc-500")}>
                  {formatMiB(childMemory)} / {formatMiB(parentMemory)}
                </span>
              </div>
              <input
                type="range"
                min="10"
                max="90"
                value={formMemoryPercent}
                onChange={(e) => setFormMemoryPercent(parseInt(e.target.value))}
                className="w-full"
              />
            </div>

            {/* Disk */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <label
                  className={cn(
                    "text-xs tracking-wider uppercase",
                    isDark ? "text-zinc-400" : "text-zinc-600"
                  )}
                >
                  Disk ({formDiskPercent}%)
                </label>
                <span className={cn("text-xs", isDark ? "text-zinc-500" : "text-zinc-500")}>
                  {formatMiB(childDisk)} / {formatMiB(parentDisk)}
                </span>
              </div>
              <input
                type="range"
                min="10"
                max="90"
                value={formDiskPercent}
                onChange={(e) => setFormDiskPercent(parseInt(e.target.value))}
                className="w-full"
              />
            </div>

            {/* CPU */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <label
                  className={cn(
                    "text-xs tracking-wider uppercase",
                    isDark ? "text-zinc-400" : "text-zinc-600"
                  )}
                >
                  CPU ({formCpuPercent}%)
                </label>
                <span className={cn("text-xs", isDark ? "text-zinc-500" : "text-zinc-500")}>
                  {childCpu}% / {parentCpu}%
                </span>
              </div>
              <input
                type="range"
                min="10"
                max="90"
                value={formCpuPercent}
                onChange={(e) => setFormCpuPercent(parseInt(e.target.value))}
                className="w-full"
              />
            </div>
          </div>

          {/* Preview */}
          <div
            className={cn(
              "border p-4",
              isDark ? "border-zinc-700 bg-zinc-900/50" : "border-zinc-300 bg-zinc-50"
            )}
          >
            <div
              className={cn(
                "mb-3 text-xs font-medium tracking-wider uppercase",
                isDark ? "text-zinc-400" : "text-zinc-600"
              )}
            >
              After Split
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className={cn("mb-1 text-xs", isDark ? "text-zinc-500" : "text-zinc-500")}>
                  Parent Server
                </div>
                <div className={cn("text-sm", isDark ? "text-zinc-300" : "text-zinc-700")}>
                  {formatMiB(remainingMemory)} RAM
                </div>
                <div className={cn("text-sm", isDark ? "text-zinc-300" : "text-zinc-700")}>
                  {formatMiB(remainingDisk)} Disk
                </div>
                <div className={cn("text-sm", isDark ? "text-zinc-300" : "text-zinc-700")}>
                  {remainingCpu}% CPU
                </div>
              </div>
              <div>
                <div className={cn("mb-1 text-xs", isDark ? "text-zinc-500" : "text-zinc-500")}>
                  Child Server
                </div>
                <div className={cn("text-sm", isDark ? "text-zinc-300" : "text-zinc-700")}>
                  {formatMiB(childMemory)} RAM
                </div>
                <div className={cn("text-sm", isDark ? "text-zinc-300" : "text-zinc-700")}>
                  {formatMiB(childDisk)} Disk
                </div>
                <div className={cn("text-sm", isDark ? "text-zinc-300" : "text-zinc-700")}>
                  {childCpu}% CPU
                </div>
              </div>
            </div>
          </div>

          {/* Warning */}
          <div
            className={cn(
              "flex items-start gap-2 border p-3 text-xs",
              isDark
                ? "border-amber-700/30 bg-amber-950/20 text-amber-200/80"
                : "border-amber-200 bg-amber-50 text-amber-800"
            )}
          >
            <BsExclamationTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              Splitting will permanently reduce this server's resources. The child server will
              inherit the same blueprint and configuration.
            </div>
          </div>
        </div>
      </FormModal>

      {/* Delete Child Server Modal */}
      <ConfirmationModal
        open={deleteModalOpen}
        onOpenChange={setDeleteModalOpen}
        title="Delete Child Server"
        description={`Are you sure you want to delete "${selectedChild?.name}"? This will permanently delete the server and all its data. Resources will be returned to the parent server.`}
        onConfirm={handleDeleteChild}
        confirmLabel="Delete Server"
        variant="danger"
        isDark={isDark}
      />
    </div>
  );
};

export default SplitPage;
