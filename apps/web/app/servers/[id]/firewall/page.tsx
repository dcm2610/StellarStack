"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { ShieldPlus, Shield, ShieldX, Plus, Trash2, Lock, Unlock } from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";
import { FadeIn } from "@workspace/ui/components/fade-in";
import { Spinner } from "@workspace/ui/components/spinner";
import { Button } from "@workspace/ui/components/button";
import { ConfirmationModal } from "@workspace/ui/components/confirmation-modal";
import { Switch } from "@workspace/ui/components/switch";
import { servers } from "@/lib/api";
import { useServer } from "@/components/server-provider";

export default function FirewallPage() {
  const params = useParams();
  const serverId = params.id as string;
  const { server } = useServer();

  const [rules, setRules] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [ruleToDelete, setRuleToDelete] = useState<any>(null);

  const [newRule, setNewRule] = useState({
    name: "",
    description: "",
    direction: "INBOUND" as "INBOUND" | "OUTBOUND",
    action: "ALLOW" as "ALLOW" | "DENY",
    port: 25565,
    protocol: "tcp" as "tcp" | "udp" | "both",
    sourceIp: "",
    isActive: true,
  });

  useEffect(() => {
    if (serverId) {
      fetchRules();
    }
  }, [serverId]);

  const fetchRules = async () => {
    setIsLoading(true);
    try {
      const data = await servers.firewall.list(serverId);
      setRules(data);
    } catch (error: any) {
      toast.error(error.message || "Failed to load firewall rules");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!newRule.name.trim()) {
      toast.error("Rule name is required");
      return;
    }

    setIsCreating(true);
    try {
      await servers.firewall.create(serverId, newRule);
      toast.success("Firewall rule created successfully");
      setShowCreateModal(false);
      resetForm();
      fetchRules();
    } catch (error: any) {
      toast.error(error.message || "Failed to create firewall rule");
    } finally {
      setIsCreating(false);
    }
  };

  const handleUpdate = async (ruleId: string, isActive: boolean) => {
    try {
      await servers.firewall.update(serverId, ruleId, { isActive });
      toast.success("Firewall rule updated successfully");
      fetchRules();
    } catch (error: any) {
      toast.error(error.message || "Failed to update firewall rule");
    }
  };

  const handleDelete = async () => {
    if (!ruleToDelete) return;

    try {
      await servers.firewall.delete(serverId, ruleToDelete.id);
      toast.success("Firewall rule deleted successfully");
      setDeleteModalOpen(false);
      setRuleToDelete(null);
      fetchRules();
    } catch (error: any) {
      toast.error(error.message || "Failed to delete firewall rule");
    }
  };

  const resetForm = () => {
    setNewRule({
      name: "",
      description: "",
      direction: "INBOUND",
      action: "ALLOW",
      port: 25565,
      protocol: "tcp",
      sourceIp: "",
      isActive: true,
    });
  };

  const openDeleteModal = (rule: any) => {
    setRuleToDelete(rule);
    setDeleteModalOpen(true);
  };

  return (
    <div className={cn("relative min-h-screen", "bg-black")}>
      <div className="relative z-10 flex h-screen flex-col">
        <div className="p-8">
          <div className="mx-auto max-w-6xl">
            <FadeIn delay={0}>
              <div className="mb-8 flex items-center justify-between">
                <div>
                  <h1
                    className={cn(
                      "text-2xl font-light tracking-wider",
                      "text-zinc-100"
                    )}
                  >
                    FIREWALL
                  </h1>
                  <p className={cn("mt-1 text-sm", "text-zinc-500")}>
                    {server?.name || `Server ${serverId}`}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowCreateModal(true)}
                  className={cn(
                    "flex items-center gap-2 transition-all hover:scale-[1.02] active:scale-95",
                    "border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
                  )}
                >
                  <Plus className="h-4 w-4" />
                  <span className="text-xs tracking-wider uppercase">Add Rule</span>
                </Button>
              </div>

              {isLoading ? (
                <div className="flex items-center justify-center py-20">
                  <Spinner className="h-8 w-8" />
                </div>
              ) : rules.length === 0 ? (
                <div
                  className={cn(
                    "border py-20 text-center",
                    "border-zinc-800 bg-zinc-900/50"
                  )}
                >
                  <Shield
                    className={cn(
                      "mx-auto mb-4 h-16 w-16",
                      "text-zinc-600"
                    )}
                  />
                  <p className={cn("text-lg", "text-zinc-300")}>
                    No firewall rules configured
                  </p>
                  <p className={cn("mt-2 text-sm", "text-zinc-500")}>
                    Add rules to control which ports and IP addresses can access your server
                  </p>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {rules.map((rule) => (
                    <div
                      key={rule.id}
                      className={cn(
                        "relative border p-6 transition-all",
                        "border-zinc-800 bg-zinc-900/50"
                      )}
                    >
                      <div className="mb-4 flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div
                            className={cn(
                              "rounded-lg p-2",
                              rule.action === "ALLOW"
                                ? "bg-emerald-500/20 text-emerald-400"
                                : "bg-red-500/20 text-red-400"
                            )}
                          >
                            {rule.action === "ALLOW" ? (
                              <Unlock className="h-5 w-5" />
                            ) : (
                              <ShieldX className="h-5 w-5" />
                            )}
                          </div>
                          <div>
                            <h3
                              className={cn(
                                "text-sm font-medium tracking-wider uppercase",
                              "text-zinc-200"
                            )}
                          >
                            {rule.name}
                          </h3>
                          {rule.direction && (
                            <span
                              className={cn(
                                "ml-2 px-2 py-0.5 text-[10px] font-medium uppercase",
                                "bg-zinc-700 text-zinc-400"
                                )}
                              >
                                {rule.direction}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleUpdate(rule.id, !rule.isActive)}
                            className={cn(
                              "p-2 transition-colors",
                              "text-zinc-400 hover:text-zinc-200"
                            )}
                            title={rule.isActive ? "Disable rule" : "Enable rule"}
                          >
                            {rule.isActive ? (
                              <Shield className="h-4 w-4" />
                            ) : (
                              <Unlock className="h-4 w-4" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openDeleteModal(rule)}
                            className={cn(
                              "p-2 transition-colors",
                              "text-zinc-400 hover:text-red-400"
                            )}
                            title="Delete rule"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>

                      {rule.description && (
                        <p
                          className={cn("mb-4 text-sm", "text-zinc-500")}
                        >
                          {rule.description}
                        </p>
                      )}

                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span
                            className={cn(
                              "text-xs tracking-wider uppercase",
                              "text-zinc-500"
                            )}
                          >
                            Protocol
                          </span>
                          <span
                            className={cn(
                              "font-mono text-sm",
                              "text-zinc-200"
                            )}
                          >
                            {rule.protocol?.toUpperCase() || "TCP"}
                          </span>
                        </div>

                        <div className="flex items-center justify-between">
                          <span
                            className={cn(
                              "text-xs tracking-wider uppercase",
                              "text-zinc-500"
                            )}
                          >
                            Port
                          </span>
                          <span
                            className={cn(
                              "font-mono text-sm",
                              "text-zinc-200"
                            )}
                          >
                            {rule.port}
                          </span>
                        </div>

                        {rule.sourceIp && (
                          <div className="flex items-center justify-between">
                            <span
                              className={cn(
                                "text-xs tracking-wider uppercase",
                                "text-zinc-500"
                              )}
                            >
                              Source IP
                            </span>
                            <span
                              className={cn(
                                "font-mono text-sm",
                                "text-zinc-200"
                              )}
                            >
                              {rule.sourceIp}
                            </span>
                          </div>
                        )}

                        <div className="flex items-center justify-between">
                          <span
                            className={cn(
                              "text-xs tracking-wider uppercase",
                              "text-zinc-500"
                            )}
                          >
                            Status
                          </span>
                          <div className="flex items-center gap-2">
                            <div
                              className={cn(
                                "h-2 w-2 rounded-full",
                                rule.isActive ? "bg-emerald-500" : "bg-red-500"
                              )}
                            />
                            <span
                              className={cn(
                                "text-xs font-medium",
                                rule.isActive ? "text-emerald-400" : "text-red-400"
                              )}
                            >
                              {rule.isActive ? "Active" : "Inactive"}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </FadeIn>
          </div>
        </div>

        {/* Create Rule Modal */}
        {showCreateModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div
              className={cn(
                "w-full max-w-md border p-6 shadow-2xl",
                "border-zinc-800 bg-zinc-900"
              )}
            >
              <h2
                className={cn(
                  "mb-4 text-lg font-medium",
                  "text-zinc-100"
                )}
              >
                Create Firewall Rule
              </h2>

              <div className="space-y-4">
                <div>
                  <label
                    className={cn(
                      "mb-2 block text-xs tracking-wider uppercase",
                      "text-zinc-400"
                    )}
                  >
                    Rule Name
                  </label>
                  <input
                    type="text"
                    value={newRule.name}
                    onChange={(e) => setNewRule({ ...newRule, name: e.target.value })}
                    placeholder="e.g., Allow Minecraft Port"
                    disabled={isCreating}
                    className={cn(
                      "w-full px-3 py-2 text-sm transition-colors outline-none",
                      "border-zinc-700 bg-zinc-800 text-zinc-200 placeholder:text-zinc-600 focus:border-zinc-500 disabled:cursor-not-allowed disabled:opacity-50"
                    )}
                  />
                </div>

                <div>
                  <label
                    className={cn(
                      "mb-2 block text-xs tracking-wider uppercase",
                      "text-zinc-400"
                    )}
                  >
                    Description
                  </label>
                  <input
                    type="text"
                    value={newRule.description}
                    onChange={(e) => setNewRule({ ...newRule, description: e.target.value })}
                    placeholder="Optional description..."
                    disabled={isCreating}
                    className={cn(
                      "w-full px-3 py-2 text-sm transition-colors outline-none",
                      "border-zinc-700 bg-zinc-800 text-zinc-200 placeholder:text-zinc-600 focus:border-zinc-500 disabled:cursor-not-allowed disabled:opacity-50"
                    )}
                  />
                </div>

                <div>
                  <label
                    className={cn(
                      "mb-2 block text-xs tracking-wider uppercase",
                      "text-zinc-400"
                    )}
                  >
                    Direction
                  </label>
                  <select
                    value={newRule.direction}
                    onChange={(e) =>
                      setNewRule({
                        ...newRule,
                        direction: e.target.value as "INBOUND" | "OUTBOUND",
                      })
                    }
                    disabled={isCreating}
                    className={cn(
                      "w-full px-3 py-2 text-sm transition-colors outline-none",
                      "border-zinc-700 bg-zinc-800 text-zinc-200 focus:border-zinc-500 disabled:cursor-not-allowed disabled:opacity-50"
                    )}
                  >
                    <option value="INBOUND">Inbound</option>
                    <option value="OUTBOUND">Outbound</option>
                  </select>
                </div>

                <div>
                  <label
                    className={cn(
                      "mb-2 block text-xs tracking-wider uppercase",
                      "text-zinc-400"
                    )}
                  >
                    Action
                  </label>
                  <select
                    value={newRule.action}
                    onChange={(e) =>
                      setNewRule({ ...newRule, action: e.target.value as "ALLOW" | "DENY" })
                    }
                    disabled={isCreating}
                    className={cn(
                      "w-full px-3 py-2 text-sm transition-colors outline-none",
                      "border-zinc-700 bg-zinc-800 text-zinc-200 focus:border-zinc-500 disabled:cursor-not-allowed disabled:opacity-50"
                    )}
                  >
                    <option value="ALLOW">Allow</option>
                    <option value="DENY">Deny</option>
                  </select>
                </div>

                <div>
                  <label
                    className={cn(
                      "mb-2 block text-xs tracking-wider uppercase",
                      "text-zinc-400"
                    )}
                  >
                    Protocol
                  </label>
                  <select
                    value={newRule.protocol}
                    onChange={(e) =>
                      setNewRule({ ...newRule, protocol: e.target.value as "tcp" | "udp" | "both" })
                    }
                    disabled={isCreating}
                    className={cn(
                      "w-full px-3 py-2 text-sm transition-colors outline-none",
                      "border-zinc-700 bg-zinc-800 text-zinc-200 focus:border-zinc-500 disabled:cursor-not-allowed disabled:opacity-50"
                    )}
                  >
                    <option value="tcp">TCP</option>
                    <option value="udp">UDP</option>
                    <option value="both">Both (TCP & UDP)</option>
                  </select>
                </div>

                <div>
                  <label
                    className={cn(
                      "mb-2 block text-xs tracking-wider uppercase",
                      "text-zinc-400"
                    )}
                  >
                    Port
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={65535}
                    value={newRule.port}
                    onChange={(e) =>
                      setNewRule({ ...newRule, port: parseInt(e.target.value) || 25565 })
                    }
                    disabled={isCreating}
                    className={cn(
                      "w-full px-3 py-2 text-sm transition-colors outline-none",
                      "border-zinc-700 bg-zinc-800 text-zinc-200 placeholder:text-zinc-600 focus:border-zinc-500 disabled:cursor-not-allowed disabled:opacity-50"
                    )}
                  />
                </div>

                <div>
                  <label
                    className={cn(
                      "mb-2 block text-xs tracking-wider uppercase",
                      "text-zinc-400"
                    )}
                  >
                    Source IP
                  </label>
                  <input
                    type="text"
                    value={newRule.sourceIp}
                    onChange={(e) => setNewRule({ ...newRule, sourceIp: e.target.value })}
                    placeholder="e.g., 192.168.1.1 (optional)"
                    disabled={isCreating}
                    className={cn(
                      "w-full px-3 py-2 text-sm transition-colors outline-none",
                      "border-zinc-700 bg-zinc-800 text-zinc-200 placeholder:text-zinc-600 focus:border-zinc-500 disabled:cursor-not-allowed disabled:opacity-50"
                    )}
                  />
                  <p className={cn("mt-1 text-xs", "text-zinc-500")}>
                    Leave empty to allow/deny from any IP address
                  </p>
                </div>

                <div className="flex items-center justify-between">
                  <label
                    className={cn(
                      "text-xs tracking-wider uppercase",
                      "text-zinc-400"
                    )}
                  >
                    Active
                  </label>
                  <Switch
                    checked={newRule.isActive}
                    onCheckedChange={(checked) => setNewRule({ ...newRule, isActive: checked })}
                    disabled={isCreating}
                  />
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowCreateModal(false);
                    resetForm();
                  }}
                  disabled={isCreating}
                  className={cn(
                    "text-xs tracking-wider uppercase",
                    "border-zinc-700 text-zinc-400"
                  )}
                >
                  Cancel
                </Button>
                <Button
                  disabled={!newRule.name.trim() || isCreating}
                  onClick={handleCreate}
                  className={cn(
                    "text-xs tracking-wider uppercase",
                    "bg-zinc-100 text-zinc-900 hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-40"
                  )}
                >
                  {isCreating ? "Creating..." : "Create Rule"}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        <ConfirmationModal
          open={deleteModalOpen}
          onOpenChange={setDeleteModalOpen}
          title="Delete Firewall Rule"
          description={`Are you sure you want to delete "${ruleToDelete?.name}"? This action cannot be undone.`}
          confirmLabel="Delete"
          variant="danger"
          onConfirm={handleDelete}
        />
      </div>
    </div>
  );
}
