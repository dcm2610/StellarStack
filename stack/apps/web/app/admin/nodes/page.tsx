"use client";

import { useEffect, useState } from "react";
import { useTheme as useNextTheme } from "next-themes";
import { cn } from "@workspace/ui/lib/utils";
import { Button } from "@workspace/ui/components/button";
import { AnimatedBackground } from "@workspace/ui/components/shared/AnimatedBackground";
import { FadeIn, FloatingDots } from "@workspace/ui/components/shared/Animations";
import { ConfirmationModal } from "@workspace/ui/components/shared/ConfirmationModal";
import { CpuIcon, PlusIcon, TrashIcon, EditIcon, CopyIcon, CheckIcon, SettingsIcon, ArrowLeftIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { nodes, locations } from "@/lib/api";
import type { Node, Location, CreateNodeData } from "@/lib/api";
import { toast } from "sonner";

export default function NodesPage() {
  const router = useRouter();
  const { resolvedTheme } = useNextTheme();
  const [mounted, setMounted] = useState(false);
  const [nodesList, setNodesList] = useState<Node[]>([]);
  const [locationsList, setLocationsList] = useState<Location[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingNode, setEditingNode] = useState<Node | null>(null);
  const [showToken, setShowToken] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [nodeToDelete, setNodeToDelete] = useState<Node | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Form state
  const [formData, setFormData] = useState<CreateNodeData>({
    displayName: "",
    host: "",
    port: 3001,
    protocol: "HTTP",
    sftpPort: 2022,
    memoryLimit: 8589934592, // 8GB
    diskLimit: 53687091200, // 50GB
    cpuLimit: 4,
    uploadLimit: 104857600, // 100MB
    locationId: "",
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  const fetchData = async () => {
    try {
      const [nodesData, locationsData] = await Promise.all([
        nodes.list(),
        locations.list(),
      ]);
      setNodesList(nodesData);
      setLocationsList(locationsData);
    } catch (error) {
      toast.error("Failed to fetch data");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const isDark = mounted ? resolvedTheme === "dark" : true;

  const resetForm = () => {
    setFormData({
      displayName: "",
      host: "",
      port: 3001,
      protocol: "HTTP",
      sftpPort: 2022,
      memoryLimit: 8589934592,
      diskLimit: 53687091200,
      cpuLimit: 4,
      uploadLimit: 104857600,
      locationId: "",
    });
    setEditingNode(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingNode) {
        await nodes.update(editingNode.id, formData);
        toast.success("Node updated successfully");
      } else {
        const result = await nodes.create(formData);
        setShowToken(result.token);
        toast.success("Node created successfully");
      }
      setIsModalOpen(false);
      resetForm();
      fetchData();
    } catch (error) {
      toast.error(editingNode ? "Failed to update node" : "Failed to create node");
    }
  };

  const handleEdit = (node: Node) => {
    setEditingNode(node);
    setFormData({
      displayName: node.displayName,
      host: node.host,
      port: node.port,
      protocol: node.protocol,
      sftpPort: node.sftpPort,
      memoryLimit: node.memoryLimit,
      diskLimit: node.diskLimit,
      cpuLimit: node.cpuLimit,
      uploadLimit: node.uploadLimit,
      locationId: node.locationId || "",
    });
    setIsModalOpen(true);
  };

  const openDeleteModal = (node: Node) => {
    setNodeToDelete(node);
    setDeleteModalOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!nodeToDelete) return;
    setIsDeleting(true);
    try {
      await nodes.delete(nodeToDelete.id);
      toast.success("Node deleted successfully");
      setDeleteModalOpen(false);
      setNodeToDelete(null);
      fetchData();
    } catch (error) {
      toast.error("Failed to delete node");
    } finally {
      setIsDeleting(false);
    }
  };

  const copyToken = () => {
    if (showToken) {
      navigator.clipboard.writeText(showToken);
      setCopiedToken(true);
      setTimeout(() => setCopiedToken(false), 2000);
    }
  };

  const formatBytes = (bytes: number) => {
    const gb = bytes / 1073741824;
    return gb >= 1 ? `${gb.toFixed(0)} GB` : `${(bytes / 1048576).toFixed(0)} MB`;
  };

  const inputClasses = cn(
    "w-full px-3 py-2 border text-sm transition-colors focus:outline-none",
    isDark
      ? "bg-zinc-900 border-zinc-700 text-zinc-100 focus:border-zinc-500"
      : "bg-white border-zinc-300 text-zinc-900 focus:border-zinc-400"
  );

  const labelClasses = cn(
    "block text-xs font-medium uppercase tracking-wider mb-1",
    isDark ? "text-zinc-400" : "text-zinc-600"
  );

  return (
    <div className={cn("min-h-svh transition-colors relative", isDark ? "bg-[#0b0b0a]" : "bg-[#f5f5f4]")}>
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
                    NODES
                  </h1>
                  <p className={cn(
                    "text-sm mt-1",
                    isDark ? "text-zinc-500" : "text-zinc-500"
                  )}>
                    Manage daemon nodes
                  </p>
                </div>
              </div>
              <Button
                onClick={() => { resetForm(); setIsModalOpen(true); }}
                className={cn(
                  "flex items-center gap-2 text-xs uppercase tracking-wider transition-all hover:scale-[1.02] active:scale-95",
                  isDark
                    ? "bg-zinc-100 text-zinc-900 hover:bg-zinc-200"
                    : "bg-zinc-800 text-zinc-100 hover:bg-zinc-700"
                )}
              >
                <PlusIcon className="w-4 h-4" />
                Add Node
              </Button>
            </div>
          </FadeIn>

          {/* Nodes List */}
          <FadeIn delay={0.1}>
            <div className="space-y-3">
        {isLoading ? (
          <div className={cn("text-center py-12 text-sm", isDark ? "text-zinc-500" : "text-zinc-400")}>
            Loading...
          </div>
        ) : nodesList.length === 0 ? (
          <div className={cn(
            "text-center py-12 border",
            isDark ? "border-zinc-800 text-zinc-500" : "border-zinc-200 text-zinc-400"
          )}>
            No nodes configured. Add your first node to get started.
          </div>
        ) : (
          nodesList.map((node, index) => (
            <FadeIn key={node.id} delay={0.1 + index * 0.05}>
              <div
                className={cn(
                  "relative p-5 border transition-all hover:scale-[1.005] group",
                  isDark
                    ? "bg-gradient-to-b from-[#141414] via-[#0f0f0f] to-[#0a0a0a] border-zinc-200/10 shadow-lg shadow-black/20 hover:border-zinc-700"
                    : "bg-gradient-to-b from-white via-zinc-50 to-zinc-100 border-zinc-300 shadow-lg shadow-zinc-400/20 hover:border-zinc-400"
                )}
              >
              {/* Corner accents */}
              <div className={cn("absolute top-0 left-0 w-2 h-2 border-t border-l", isDark ? "border-zinc-500" : "border-zinc-400")} />
              <div className={cn("absolute top-0 right-0 w-2 h-2 border-t border-r", isDark ? "border-zinc-500" : "border-zinc-400")} />
              <div className={cn("absolute bottom-0 left-0 w-2 h-2 border-b border-l", isDark ? "border-zinc-500" : "border-zinc-400")} />
              <div className={cn("absolute bottom-0 right-0 w-2 h-2 border-b border-r", isDark ? "border-zinc-500" : "border-zinc-400")} />

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <CpuIcon className={cn(
                    "w-8 h-8",
                    node.isOnline
                      ? (isDark ? "text-green-400" : "text-green-600")
                      : (isDark ? "text-zinc-600" : "text-zinc-400")
                  )} />
                  <div>
                    <div className={cn(
                      "font-medium flex items-center gap-2",
                      isDark ? "text-zinc-100" : "text-zinc-800"
                    )}>
                      {node.displayName}
                      <span className={cn(
                        "text-[10px] px-1.5 py-0.5 uppercase tracking-wider",
                        node.isOnline
                          ? (isDark ? "bg-green-900/50 text-green-400" : "bg-green-100 text-green-700")
                          : (isDark ? "bg-zinc-800 text-zinc-500" : "bg-zinc-100 text-zinc-500")
                      )}>
                        {node.isOnline ? "Online" : "Offline"}
                      </span>
                    </div>
                    <div className={cn("text-xs mt-1", isDark ? "text-zinc-500" : "text-zinc-400")}>
                      {node.protocol.toLowerCase()}://{node.host}:{node.port}
                    </div>
                    <div className={cn("text-xs mt-1 flex gap-4", isDark ? "text-zinc-600" : "text-zinc-400")}>
                      <span>CPU: {node.cpuLimit} cores</span>
                      <span>RAM: {formatBytes(node.memoryLimit)}</span>
                      <span>Disk: {formatBytes(node.diskLimit)}</span>
                      {node.heartbeatLatency && (
                        <span className={cn(isDark ? "text-green-400" : "text-green-600")}>
                          {node.heartbeatLatency}ms
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => router.push(`/admin/nodes/${node.id}`)}
                    className={cn(
                      "text-xs p-2 transition-all hover:scale-110 active:scale-95",
                      isDark ? "border-zinc-700 text-zinc-400 hover:text-zinc-100" : "border-zinc-300 text-zinc-600 hover:text-zinc-900"
                    )}
                  >
                    <SettingsIcon className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleEdit(node)}
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
                    onClick={() => openDeleteModal(node)}
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

      {/* Create/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className={cn(
            "relative w-full max-w-lg mx-4 p-6 border max-h-[90vh] overflow-y-auto",
            isDark
              ? "bg-[#0f0f0f] border-zinc-700"
              : "bg-white border-zinc-300"
          )}>
            {/* Corner accents */}
            <div className={cn("absolute top-0 left-0 w-3 h-3 border-t border-l", isDark ? "border-zinc-500" : "border-zinc-400")} />
            <div className={cn("absolute top-0 right-0 w-3 h-3 border-t border-r", isDark ? "border-zinc-500" : "border-zinc-400")} />
            <div className={cn("absolute bottom-0 left-0 w-3 h-3 border-b border-l", isDark ? "border-zinc-500" : "border-zinc-400")} />
            <div className={cn("absolute bottom-0 right-0 w-3 h-3 border-b border-r", isDark ? "border-zinc-500" : "border-zinc-400")} />

            <h2 className={cn(
              "text-lg font-light tracking-wider mb-6",
              isDark ? "text-zinc-100" : "text-zinc-800"
            )}>
              {editingNode ? "Edit Node" : "Create Node"}
            </h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className={labelClasses}>Display Name</label>
                <input
                  type="text"
                  value={formData.displayName}
                  onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                  className={inputClasses}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClasses}>Host</label>
                  <input
                    type="text"
                    value={formData.host}
                    onChange={(e) => setFormData({ ...formData, host: e.target.value })}
                    placeholder="192.168.1.100"
                    className={inputClasses}
                    required
                  />
                </div>
                <div>
                  <label className={labelClasses}>Port</label>
                  <input
                    type="number"
                    value={formData.port}
                    onChange={(e) => setFormData({ ...formData, port: parseInt(e.target.value) })}
                    className={inputClasses}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClasses}>Protocol</label>
                  <select
                    value={formData.protocol}
                    onChange={(e) => setFormData({ ...formData, protocol: e.target.value as "HTTP" | "HTTPS" | "HTTPS_PROXY" })}
                    className={inputClasses}
                  >
                    <option value="HTTP">HTTP</option>
                    <option value="HTTPS">HTTPS</option>
                    <option value="HTTPS_PROXY">HTTPS Proxy</option>
                  </select>
                </div>
                <div>
                  <label className={labelClasses}>Location</label>
                  <select
                    value={formData.locationId || ""}
                    onChange={(e) => setFormData({ ...formData, locationId: e.target.value || undefined })}
                    className={inputClasses}
                  >
                    <option value="">No Location</option>
                    {locationsList.map((loc) => (
                      <option key={loc.id} value={loc.id}>{loc.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className={labelClasses}>CPU Cores</label>
                  <input
                    type="number"
                    value={formData.cpuLimit}
                    onChange={(e) => setFormData({ ...formData, cpuLimit: parseInt(e.target.value) })}
                    className={inputClasses}
                    required
                  />
                </div>
                <div>
                  <label className={labelClasses}>Memory (GB)</label>
                  <input
                    type="number"
                    value={formData.memoryLimit / 1073741824}
                    onChange={(e) => setFormData({ ...formData, memoryLimit: parseFloat(e.target.value) * 1073741824 })}
                    className={inputClasses}
                    required
                  />
                </div>
                <div>
                  <label className={labelClasses}>Disk (GB)</label>
                  <input
                    type="number"
                    value={formData.diskLimit / 1073741824}
                    onChange={(e) => setFormData({ ...formData, diskLimit: parseFloat(e.target.value) * 1073741824 })}
                    className={inputClasses}
                    required
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => { setIsModalOpen(false); resetForm(); }}
                  className={cn(
                    "text-xs uppercase tracking-wider",
                    isDark ? "border-zinc-700 text-zinc-400" : "border-zinc-300 text-zinc-600"
                  )}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className={cn(
                    "text-xs uppercase tracking-wider",
                    isDark
                      ? "bg-zinc-100 text-zinc-900 hover:bg-zinc-200"
                      : "bg-zinc-800 text-zinc-100 hover:bg-zinc-700"
                  )}
                >
                  {editingNode ? "Update" : "Create"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Token Modal */}
      {showToken && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className={cn(
            "relative w-full max-w-lg mx-4 p-6 border",
            isDark
              ? "bg-[#0f0f0f] border-zinc-700"
              : "bg-white border-zinc-300"
          )}>
            <h2 className={cn(
              "text-lg font-light tracking-wider mb-4",
              isDark ? "text-zinc-100" : "text-zinc-800"
            )}>
              Node Token
            </h2>
            <p className={cn("text-sm mb-4", isDark ? "text-zinc-400" : "text-zinc-600")}>
              Copy this token and use it to configure the daemon. This token will only be shown once.
            </p>
            <div className={cn(
              "p-3 font-mono text-xs break-all border flex items-center justify-between gap-2",
              isDark ? "bg-zinc-900 border-zinc-700 text-zinc-300" : "bg-zinc-50 border-zinc-200 text-zinc-700"
            )}>
              <span className="flex-1">{showToken}</span>
              <Button
                variant="outline"
                size="sm"
                onClick={copyToken}
                className={cn("shrink-0", isDark ? "border-zinc-700" : "border-zinc-300")}
              >
                {copiedToken ? <CheckIcon className="w-4 h-4 text-green-500" /> : <CopyIcon className="w-4 h-4" />}
              </Button>
            </div>
            <div className="flex justify-end mt-6">
              <Button
                onClick={() => setShowToken(null)}
                className={cn(
                  "text-xs uppercase tracking-wider",
                  isDark
                    ? "bg-zinc-100 text-zinc-900 hover:bg-zinc-200"
                    : "bg-zinc-800 text-zinc-100 hover:bg-zinc-700"
                )}
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      <ConfirmationModal
        open={deleteModalOpen}
        onOpenChange={setDeleteModalOpen}
        title="Delete Node"
        description={`Are you sure you want to delete "${nodeToDelete?.displayName}"? This action cannot be undone.`}
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
