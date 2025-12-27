"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTheme as useNextTheme } from "next-themes";
import { cn } from "@workspace/ui/lib/utils";
import { Button } from "@workspace/ui/components/button";
import {
  ArrowLeftIcon,
  CpuIcon,
  HardDriveIcon,
  MemoryStickIcon,
  NetworkIcon,
  PlusIcon,
  TrashIcon,
  ServerIcon,
  ActivityIcon,
  GlobeIcon,
} from "lucide-react";
import { nodes } from "@/lib/api";
import type { Node, NodeStats, Allocation } from "@/lib/api";
import { toast } from "sonner";

export default function NodeDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { resolvedTheme } = useNextTheme();
  const [mounted, setMounted] = useState(false);
  const [node, setNode] = useState<Node | null>(null);
  const [stats, setStats] = useState<NodeStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAddingAllocation, setIsAddingAllocation] = useState(false);
  const [allocationForm, setAllocationForm] = useState({
    ip: "",
    startPort: 25565,
    endPort: 25565,
    isRange: false,
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  const fetchNode = useCallback(async () => {
    try {
      const data = await nodes.get(params.id as string);
      setNode(data);
    } catch {
      toast.error("Failed to fetch node");
    } finally {
      setIsLoading(false);
    }
  }, [params.id]);

  const fetchStats = useCallback(async () => {
    if (!node?.isOnline) return;
    try {
      const data = await nodes.getStats(params.id as string);
      setStats(data);
    } catch {
      // Stats fetch failed, node might be offline
    }
  }, [params.id, node?.isOnline]);

  useEffect(() => {
    fetchNode();
  }, [fetchNode]);

  useEffect(() => {
    if (node?.isOnline) {
      fetchStats();
      const interval = setInterval(fetchStats, 5000);
      return () => clearInterval(interval);
    }
  }, [node?.isOnline, fetchStats]);

  const isDark = mounted ? resolvedTheme === "dark" : true;

  const handleAddAllocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!node) return;

    try {
      if (allocationForm.isRange) {
        const result = await nodes.addAllocationRange(node.id, {
          ip: allocationForm.ip,
          startPort: allocationForm.startPort,
          endPort: allocationForm.endPort,
        });
        toast.success(`Created ${result.count} allocations`);
      } else {
        await nodes.addAllocation(node.id, {
          ip: allocationForm.ip,
          port: allocationForm.startPort,
        });
        toast.success("Allocation added");
      }
      setIsAddingAllocation(false);
      setAllocationForm({ ip: "", startPort: 25565, endPort: 25565, isRange: false });
      fetchNode();
    } catch {
      toast.error("Failed to add allocation");
    }
  };

  const handleDeleteAllocation = async (allocation: Allocation) => {
    if (!node) return;
    if (allocation.assigned) {
      toast.error("Cannot delete assigned allocation");
      return;
    }
    if (!confirm(`Delete allocation ${allocation.ip}:${allocation.port}?`)) return;

    try {
      await nodes.deleteAllocation(node.id, allocation.id);
      toast.success("Allocation deleted");
      fetchNode();
    } catch {
      toast.error("Failed to delete allocation");
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes >= 1099511627776) return `${(bytes / 1099511627776).toFixed(1)} TB`;
    if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(1)} GB`;
    if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
    return `${bytes} B`;
  };

  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
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

  if (isLoading) {
    return (
      <div className={cn("min-h-svh p-6 flex items-center justify-center", isDark ? "bg-[#0b0b0a]" : "bg-[#f5f5f4]")}>
        <div className={cn("text-sm", isDark ? "text-zinc-500" : "text-zinc-400")}>Loading...</div>
      </div>
    );
  }

  if (!node) {
    return (
      <div className={cn("min-h-svh p-6 flex items-center justify-center", isDark ? "bg-[#0b0b0a]" : "bg-[#f5f5f4]")}>
        <div className={cn("text-sm", isDark ? "text-zinc-500" : "text-zinc-400")}>Node not found</div>
      </div>
    );
  }

  return (
    <div className={cn("min-h-svh p-6", isDark ? "bg-[#0b0b0a]" : "bg-[#f5f5f4]")}>
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Button
          variant="outline"
          size="sm"
          onClick={() => router.push("/admin/nodes")}
          className={cn(isDark ? "border-zinc-700" : "border-zinc-300")}
        >
          <ArrowLeftIcon className="w-4 h-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className={cn("text-2xl font-light tracking-wider", isDark ? "text-zinc-100" : "text-zinc-800")}>
              {node.displayName}
            </h1>
            <span
              className={cn(
                "text-[10px] px-2 py-0.5 uppercase tracking-wider",
                node.isOnline
                  ? isDark ? "bg-green-900/50 text-green-400" : "bg-green-100 text-green-700"
                  : isDark ? "bg-zinc-800 text-zinc-500" : "bg-zinc-100 text-zinc-500"
              )}
            >
              {node.isOnline ? "Online" : "Offline"}
            </span>
            {node.heartbeatLatency && (
              <span className={cn("text-xs", isDark ? "text-zinc-500" : "text-zinc-400")}>
                {node.heartbeatLatency}ms
              </span>
            )}
          </div>
          <p className={cn("text-sm mt-1", isDark ? "text-zinc-500" : "text-zinc-500")}>
            {node.protocol.toLowerCase()}://{node.host}:{node.port}
          </p>
        </div>
      </div>

      {/* Stats Grid */}
      {stats && (
        <div className="grid grid-cols-4 gap-4 mb-6">
          {/* CPU */}
          <div className={cn("p-4 border", isDark ? "bg-zinc-900/50 border-zinc-700/50" : "bg-white border-zinc-200")}>
            <div className="flex items-center gap-2 mb-2">
              <CpuIcon className={cn("w-4 h-4", isDark ? "text-zinc-400" : "text-zinc-500")} />
              <span className={cn("text-xs uppercase tracking-wider", isDark ? "text-zinc-400" : "text-zinc-500")}>
                CPU
              </span>
            </div>
            <div className={cn("text-2xl font-light", isDark ? "text-zinc-100" : "text-zinc-800")}>
              {stats.cpu.usage_percent.toFixed(1)}%
            </div>
            <div className={cn("text-xs mt-1", isDark ? "text-zinc-600" : "text-zinc-400")}>
              {stats.cpu.cores} cores | Load: {stats.cpu.load_avg.one.toFixed(2)}
            </div>
          </div>

          {/* Memory */}
          <div className={cn("p-4 border", isDark ? "bg-zinc-900/50 border-zinc-700/50" : "bg-white border-zinc-200")}>
            <div className="flex items-center gap-2 mb-2">
              <MemoryStickIcon className={cn("w-4 h-4", isDark ? "text-zinc-400" : "text-zinc-500")} />
              <span className={cn("text-xs uppercase tracking-wider", isDark ? "text-zinc-400" : "text-zinc-500")}>
                Memory
              </span>
            </div>
            <div className={cn("text-2xl font-light", isDark ? "text-zinc-100" : "text-zinc-800")}>
              {stats.memory.usage_percent.toFixed(1)}%
            </div>
            <div className={cn("text-xs mt-1", isDark ? "text-zinc-600" : "text-zinc-400")}>
              {formatBytes(stats.memory.used)} / {formatBytes(stats.memory.total)}
            </div>
          </div>

          {/* Disk */}
          <div className={cn("p-4 border", isDark ? "bg-zinc-900/50 border-zinc-700/50" : "bg-white border-zinc-200")}>
            <div className="flex items-center gap-2 mb-2">
              <HardDriveIcon className={cn("w-4 h-4", isDark ? "text-zinc-400" : "text-zinc-500")} />
              <span className={cn("text-xs uppercase tracking-wider", isDark ? "text-zinc-400" : "text-zinc-500")}>
                Disk
              </span>
            </div>
            <div className={cn("text-2xl font-light", isDark ? "text-zinc-100" : "text-zinc-800")}>
              {stats.disk.usage_percent.toFixed(1)}%
            </div>
            <div className={cn("text-xs mt-1", isDark ? "text-zinc-600" : "text-zinc-400")}>
              {formatBytes(stats.disk.used)} / {formatBytes(stats.disk.total)}
            </div>
          </div>

          {/* System Info */}
          <div className={cn("p-4 border", isDark ? "bg-zinc-900/50 border-zinc-700/50" : "bg-white border-zinc-200")}>
            <div className="flex items-center gap-2 mb-2">
              <ActivityIcon className={cn("w-4 h-4", isDark ? "text-zinc-400" : "text-zinc-500")} />
              <span className={cn("text-xs uppercase tracking-wider", isDark ? "text-zinc-400" : "text-zinc-500")}>
                Uptime
              </span>
            </div>
            <div className={cn("text-2xl font-light", isDark ? "text-zinc-100" : "text-zinc-800")}>
              {formatUptime(stats.uptime)}
            </div>
            <div className={cn("text-xs mt-1", isDark ? "text-zinc-600" : "text-zinc-400")}>
              {stats.os.name} {stats.os.arch}
            </div>
          </div>
        </div>
      )}

      {/* Allocations Section */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className={cn("text-lg font-light tracking-wider", isDark ? "text-zinc-100" : "text-zinc-800")}>
            Allocations
          </h2>
          <Button
            size="sm"
            onClick={() => setIsAddingAllocation(true)}
            className={cn(
              "text-xs uppercase tracking-wider",
              isDark ? "bg-zinc-100 text-zinc-900 hover:bg-zinc-200" : "bg-zinc-800 text-zinc-100 hover:bg-zinc-700"
            )}
          >
            <PlusIcon className="w-3 h-3 mr-1" />
            Add
          </Button>
        </div>

        {isAddingAllocation && (
          <form
            onSubmit={handleAddAllocation}
            className={cn("p-4 border mb-4", isDark ? "bg-zinc-900/50 border-zinc-700/50" : "bg-white border-zinc-200")}
          >
            <div className="grid grid-cols-4 gap-4">
              <div>
                <label className={labelClasses}>IP Address</label>
                <input
                  type="text"
                  value={allocationForm.ip}
                  onChange={(e) => setAllocationForm({ ...allocationForm, ip: e.target.value })}
                  placeholder="0.0.0.0"
                  className={inputClasses}
                  required
                />
              </div>
              <div>
                <label className={labelClasses}>{allocationForm.isRange ? "Start Port" : "Port"}</label>
                <input
                  type="number"
                  value={allocationForm.startPort}
                  onChange={(e) => setAllocationForm({ ...allocationForm, startPort: parseInt(e.target.value) })}
                  className={inputClasses}
                  required
                />
              </div>
              {allocationForm.isRange && (
                <div>
                  <label className={labelClasses}>End Port</label>
                  <input
                    type="number"
                    value={allocationForm.endPort}
                    onChange={(e) => setAllocationForm({ ...allocationForm, endPort: parseInt(e.target.value) })}
                    className={inputClasses}
                    required
                  />
                </div>
              )}
              <div className="flex items-end gap-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={allocationForm.isRange}
                    onChange={(e) => setAllocationForm({ ...allocationForm, isRange: e.target.checked })}
                    className="rounded"
                  />
                  <span className={cn("text-xs", isDark ? "text-zinc-400" : "text-zinc-600")}>Range</span>
                </label>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsAddingAllocation(false)}
                className={cn(isDark ? "border-zinc-700" : "border-zinc-300")}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                className={cn(
                  isDark ? "bg-zinc-100 text-zinc-900 hover:bg-zinc-200" : "bg-zinc-800 text-zinc-100 hover:bg-zinc-700"
                )}
              >
                Add
              </Button>
            </div>
          </form>
        )}

        <div className={cn("border overflow-hidden", isDark ? "border-zinc-700/50" : "border-zinc-200")}>
          <table className="w-full">
            <thead>
              <tr
                className={cn(
                  "text-xs uppercase tracking-wider",
                  isDark ? "bg-zinc-900/50 text-zinc-400" : "bg-zinc-50 text-zinc-600"
                )}
              >
                <th className="text-left p-3">IP:Port</th>
                <th className="text-left p-3">Alias</th>
                <th className="text-left p-3">Status</th>
                <th className="text-left p-3">Server</th>
                <th className="text-right p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {!node.allocations || node.allocations.length === 0 ? (
                <tr>
                  <td colSpan={5} className={cn("text-center py-8 text-sm", isDark ? "text-zinc-500" : "text-zinc-400")}>
                    No allocations. Add some to assign to servers.
                  </td>
                </tr>
              ) : (
                node.allocations.map((allocation) => (
                  <tr
                    key={allocation.id}
                    className={cn(
                      "border-t transition-colors",
                      isDark ? "border-zinc-700/50 hover:bg-zinc-900/30" : "border-zinc-200 hover:bg-zinc-50"
                    )}
                  >
                    <td className={cn("p-3 font-mono text-sm", isDark ? "text-zinc-100" : "text-zinc-800")}>
                      {allocation.ip}:{allocation.port}
                    </td>
                    <td className={cn("p-3 text-sm", isDark ? "text-zinc-400" : "text-zinc-600")}>
                      {allocation.alias || "-"}
                    </td>
                    <td className="p-3">
                      <span
                        className={cn(
                          "text-[10px] px-2 py-0.5 uppercase tracking-wider",
                          allocation.assigned
                            ? isDark ? "bg-blue-900/50 text-blue-400" : "bg-blue-100 text-blue-700"
                            : isDark ? "bg-zinc-800 text-zinc-500" : "bg-zinc-100 text-zinc-500"
                        )}
                      >
                        {allocation.assigned ? "Assigned" : "Available"}
                      </span>
                    </td>
                    <td className={cn("p-3 text-sm", isDark ? "text-zinc-400" : "text-zinc-600")}>
                      {allocation.serverId || "-"}
                    </td>
                    <td className="p-3 text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDeleteAllocation(allocation)}
                        disabled={allocation.assigned}
                        className={cn(
                          "text-xs p-1.5",
                          allocation.assigned
                            ? "opacity-50 cursor-not-allowed"
                            : isDark
                              ? "border-red-900/50 text-red-400 hover:bg-red-900/20"
                              : "border-red-200 text-red-600 hover:bg-red-50"
                        )}
                      >
                        <TrashIcon className="w-3 h-3" />
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Servers Section */}
      {node.servers && node.servers.length > 0 && (
        <div>
          <h2 className={cn("text-lg font-light tracking-wider mb-4", isDark ? "text-zinc-100" : "text-zinc-800")}>
            Servers on this Node
          </h2>
          <div className="grid grid-cols-3 gap-4">
            {node.servers.map((server) => (
              <div
                key={server.id}
                className={cn("p-4 border", isDark ? "bg-zinc-900/50 border-zinc-700/50" : "bg-white border-zinc-200")}
              >
                <div className="flex items-center gap-2">
                  <ServerIcon className={cn("w-4 h-4", isDark ? "text-zinc-400" : "text-zinc-500")} />
                  <span className={cn("font-medium", isDark ? "text-zinc-100" : "text-zinc-800")}>{server.name}</span>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <span
                    className={cn(
                      "text-[10px] px-2 py-0.5 uppercase tracking-wider",
                      server.status === "RUNNING"
                        ? isDark ? "bg-green-900/50 text-green-400" : "bg-green-100 text-green-700"
                        : isDark ? "bg-zinc-800 text-zinc-500" : "bg-zinc-100 text-zinc-500"
                    )}
                  >
                    {server.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
