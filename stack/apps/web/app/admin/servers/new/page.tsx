"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme as useNextTheme } from "next-themes";
import { cn } from "@workspace/ui/lib/utils";
import { Button } from "@workspace/ui/components/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@workspace/ui/components/tabs";
import { Switch } from "@workspace/ui/components/switch";
import { AnimatedBackground } from "@workspace/ui/components/shared/AnimatedBackground";
import { FadeIn, FloatingDots } from "@workspace/ui/components/shared/Animations";
import { ArrowLeftIcon, ServerIcon, CpuIcon, HardDriveIcon, NetworkIcon, BoxIcon, InfoIcon, VariableIcon, ImageIcon } from "lucide-react";
import { servers, nodes, blueprints, account } from "@/lib/api";
import type { Node, Blueprint, User, CreateServerData } from "@/lib/api";
import { toast } from "sonner";

export default function NewServerPage() {
  const router = useRouter();
  const { resolvedTheme } = useNextTheme();
  const [mounted, setMounted] = useState(false);
  const [nodesList, setNodesList] = useState<Node[]>([]);
  const [blueprintsList, setBlueprintsList] = useState<Blueprint[]>([]);
  const [usersList, setUsersList] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [selectedBlueprint, setSelectedBlueprint] = useState<Blueprint | null>(null);
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});
  const [selectedDockerImage, setSelectedDockerImage] = useState<string>("");
  const [activeTab, setActiveTab] = useState("basic");

  // Form state
  const [formData, setFormData] = useState<CreateServerData & {
    cpuPinning: string;
    swap: number;
    oomKillDisable: boolean;
    backupLimit: number;
  }>({
    name: "",
    description: "",
    nodeId: "",
    blueprintId: "",
    ownerId: "",
    memory: 1024,
    disk: 10240,
    cpu: 100,
    cpuPinning: "",
    swap: -1, // unlimited
    oomKillDisable: false,
    backupLimit: 3,
    allocationIds: [],
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  const fetchData = async () => {
    try {
      const [nodesData, blueprintsData, usersData] = await Promise.all([
        nodes.list(),
        blueprints.list(),
        account.listUsers(),
      ]);
      setNodesList(nodesData);
      setBlueprintsList(blueprintsData);
      setUsersList(usersData);
    } catch (error) {
      toast.error("Failed to fetch data");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Fetch node details when nodeId changes
  useEffect(() => {
    if (formData.nodeId) {
      nodes.get(formData.nodeId)
        .then(node => setSelectedNode(node))
        .catch(() => setSelectedNode(null));
    } else {
      setSelectedNode(null);
    }
  }, [formData.nodeId]);

  // Update selected blueprint and initialize variables when blueprintId changes
  useEffect(() => {
    if (formData.blueprintId) {
      const blueprint = blueprintsList.find(b => b.id === formData.blueprintId);
      setSelectedBlueprint(blueprint || null);

      if (blueprint) {
        // Initialize variable values with defaults
        const defaults: Record<string, string> = {};
        if (blueprint.variables && Array.isArray(blueprint.variables)) {
          for (const v of blueprint.variables) {
            defaults[v.env_variable] = v.default_value || "";
          }
        }
        setVariableValues(defaults);

        // Set default docker image
        if (blueprint.dockerImages && Object.keys(blueprint.dockerImages).length > 0) {
          const firstImage = Object.values(blueprint.dockerImages)[0];
          setSelectedDockerImage(firstImage);
        } else {
          setSelectedDockerImage(`${blueprint.imageName}:${blueprint.imageTag || 'latest'}`);
        }
      }
    } else {
      setSelectedBlueprint(null);
      setVariableValues({});
      setSelectedDockerImage("");
    }
  }, [formData.blueprintId, blueprintsList]);

  const isDark = mounted ? resolvedTheme === "dark" : true;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (formData.allocationIds.length === 0) {
      toast.error("Please select at least one allocation");
      setActiveTab("allocations");
      return;
    }

    if (!formData.blueprintId) {
      toast.error("Please select a blueprint");
      setActiveTab("blueprint");
      return;
    }

    setIsSubmitting(true);
    try {
      const data: CreateServerData = {
        name: formData.name,
        description: formData.description || undefined,
        nodeId: formData.nodeId,
        blueprintId: formData.blueprintId,
        ownerId: formData.ownerId || undefined,
        memory: formData.memory,
        disk: formData.disk,
        cpu: formData.cpu,
        cpuPinning: formData.cpuPinning || undefined,
        swap: formData.swap,
        oomKillDisable: formData.oomKillDisable,
        backupLimit: formData.backupLimit,
        allocationIds: formData.allocationIds,
        variables: Object.keys(variableValues).length > 0 ? variableValues : undefined,
        dockerImage: selectedDockerImage || undefined,
      };

      await servers.create(data);
      toast.success("Server created successfully");
      router.push("/admin/servers");
    } catch (error: any) {
      toast.error(error.message || "Failed to create server");
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleAllocation = (allocationId: string) => {
    setFormData(prev => {
      const ids = prev.allocationIds.includes(allocationId)
        ? prev.allocationIds.filter(id => id !== allocationId)
        : [...prev.allocationIds, allocationId];
      return { ...prev, allocationIds: ids };
    });
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

  const cardClasses = cn(
    "border p-4",
    isDark ? "border-zinc-700/50 bg-zinc-900/30" : "border-zinc-200 bg-zinc-50"
  );

  if (isLoading) {
    return (
      <div className={cn("min-h-svh flex items-center justify-center relative", isDark ? "bg-[#0b0b0a]" : "bg-[#f5f5f4]")}>
        <AnimatedBackground isDark={isDark} />
        <div className={cn("text-sm relative", isDark ? "text-zinc-500" : "text-zinc-400")}>Loading...</div>
      </div>
    );
  }

  return (
    <div className={cn("min-h-svh transition-colors relative", isDark ? "bg-[#0b0b0a]" : "bg-[#f5f5f4]")}>
      <AnimatedBackground isDark={isDark} />
      <FloatingDots isDark={isDark} count={15} />

      <div className="relative p-8">
        <div className="max-w-4xl mx-auto">
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
                  CREATE SERVER
                </h1>
                <p className={cn(
                  "text-sm mt-1",
                  isDark ? "text-zinc-500" : "text-zinc-500"
                )}>
                  Configure a new game server instance
                </p>
              </div>
            </div>
          </FadeIn>

          <FadeIn delay={0.1}>
            <form onSubmit={handleSubmit}>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className={cn(
            "w-full justify-start gap-0 h-auto p-0 bg-transparent border-b",
            isDark ? "border-zinc-700/50" : "border-zinc-200"
          )}>
            <TabsTrigger
              value="basic"
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 text-xs uppercase tracking-wider rounded-none border-b-2 -mb-px data-[state=active]:shadow-none",
                isDark
                  ? "text-zinc-500 data-[state=active]:text-zinc-100 data-[state=active]:border-zinc-100 border-transparent hover:text-zinc-300"
                  : "text-zinc-500 data-[state=active]:text-zinc-900 data-[state=active]:border-zinc-900 border-transparent hover:text-zinc-700"
              )}
            >
              <InfoIcon className="w-3.5 h-3.5" />
              Basic Info
            </TabsTrigger>
            <TabsTrigger
              value="resources"
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 text-xs uppercase tracking-wider rounded-none border-b-2 -mb-px data-[state=active]:shadow-none",
                isDark
                  ? "text-zinc-500 data-[state=active]:text-zinc-100 data-[state=active]:border-zinc-100 border-transparent hover:text-zinc-300"
                  : "text-zinc-500 data-[state=active]:text-zinc-900 data-[state=active]:border-zinc-900 border-transparent hover:text-zinc-700"
              )}
            >
              <CpuIcon className="w-3.5 h-3.5" />
              Resources
            </TabsTrigger>
            <TabsTrigger
              value="allocations"
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 text-xs uppercase tracking-wider rounded-none border-b-2 -mb-px data-[state=active]:shadow-none",
                isDark
                  ? "text-zinc-500 data-[state=active]:text-zinc-100 data-[state=active]:border-zinc-100 border-transparent hover:text-zinc-300"
                  : "text-zinc-500 data-[state=active]:text-zinc-900 data-[state=active]:border-zinc-900 border-transparent hover:text-zinc-700"
              )}
            >
              <NetworkIcon className="w-3.5 h-3.5" />
              Allocations
              {formData.allocationIds.length > 0 && (
                <span className={cn(
                  "ml-1 px-1.5 py-0.5 text-[10px] rounded",
                  isDark ? "bg-green-900/50 text-green-400" : "bg-green-100 text-green-700"
                )}>
                  {formData.allocationIds.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger
              value="blueprint"
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 text-xs uppercase tracking-wider rounded-none border-b-2 -mb-px data-[state=active]:shadow-none",
                isDark
                  ? "text-zinc-500 data-[state=active]:text-zinc-100 data-[state=active]:border-zinc-100 border-transparent hover:text-zinc-300"
                  : "text-zinc-500 data-[state=active]:text-zinc-900 data-[state=active]:border-zinc-900 border-transparent hover:text-zinc-700"
              )}
            >
              <BoxIcon className="w-3.5 h-3.5" />
              Blueprint
            </TabsTrigger>
          </TabsList>

          {/* Basic Info Tab */}
          <TabsContent value="basic" className="mt-6 space-y-4">
            <div className={cardClasses}>
              <h3 className={cn("text-sm font-medium mb-4", isDark ? "text-zinc-200" : "text-zinc-700")}>
                Server Details
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClasses}>Name *</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="My Minecraft Server"
                    className={inputClasses}
                    required
                  />
                </div>
                <div>
                  <label className={labelClasses}>Owner *</label>
                  <select
                    value={formData.ownerId}
                    onChange={(e) => setFormData({ ...formData, ownerId: e.target.value })}
                    className={inputClasses}
                    required
                  >
                    <option value="">Select owner...</option>
                    {usersList.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.name} ({user.email})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="mt-4">
                <label className={labelClasses}>Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Optional description..."
                  rows={3}
                  className={inputClasses}
                />
              </div>
            </div>

            <div className={cardClasses}>
              <h3 className={cn("text-sm font-medium mb-4", isDark ? "text-zinc-200" : "text-zinc-700")}>
                Backup Settings
              </h3>
              <div className="w-48">
                <label className={labelClasses}>Backup Limit</label>
                <input
                  type="number"
                  value={formData.backupLimit}
                  onChange={(e) => setFormData({ ...formData, backupLimit: parseInt(e.target.value) || 0 })}
                  min={0}
                  max={100}
                  className={inputClasses}
                />
                <p className={cn("text-xs mt-1", isDark ? "text-zinc-600" : "text-zinc-400")}>
                  Maximum number of backups to keep
                </p>
              </div>
            </div>
          </TabsContent>

          {/* Resources Tab */}
          <TabsContent value="resources" className="mt-6 space-y-4">
            <div className={cardClasses}>
              <h3 className={cn("text-sm font-medium mb-4", isDark ? "text-zinc-200" : "text-zinc-700")}>
                Resource Limits
              </h3>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className={labelClasses}>Memory (MiB) *</label>
                  <input
                    type="number"
                    value={formData.memory}
                    onChange={(e) => setFormData({ ...formData, memory: parseInt(e.target.value) || 0 })}
                    min={128}
                    className={inputClasses}
                    required
                  />
                  <p className={cn("text-xs mt-1", isDark ? "text-zinc-600" : "text-zinc-400")}>
                    {(formData.memory / 1024).toFixed(2)} GiB
                  </p>
                </div>
                <div>
                  <label className={labelClasses}>Disk (MiB) *</label>
                  <input
                    type="number"
                    value={formData.disk}
                    onChange={(e) => setFormData({ ...formData, disk: parseInt(e.target.value) || 0 })}
                    min={1024}
                    className={inputClasses}
                    required
                  />
                  <p className={cn("text-xs mt-1", isDark ? "text-zinc-600" : "text-zinc-400")}>
                    {(formData.disk / 1024).toFixed(2)} GiB
                  </p>
                </div>
                <div>
                  <label className={labelClasses}>CPU (%) *</label>
                  <input
                    type="number"
                    value={formData.cpu}
                    onChange={(e) => setFormData({ ...formData, cpu: parseInt(e.target.value) || 0 })}
                    min={1}
                    max={10000}
                    className={inputClasses}
                    required
                  />
                  <p className={cn("text-xs mt-1", isDark ? "text-zinc-600" : "text-zinc-400")}>
                    {formData.cpu}% = {(formData.cpu / 100).toFixed(2)} thread(s)
                  </p>
                </div>
              </div>
            </div>

            <div className={cardClasses}>
              <h3 className={cn("text-sm font-medium mb-4", isDark ? "text-zinc-200" : "text-zinc-700")}>
                CPU Pinning
              </h3>
              <div>
                <label className={labelClasses}>Pin to CPUs</label>
                <input
                  type="text"
                  value={formData.cpuPinning}
                  onChange={(e) => setFormData({ ...formData, cpuPinning: e.target.value })}
                  placeholder="e.g., 0,1,2,3 or 0-4"
                  className={inputClasses}
                />
                <p className={cn("text-xs mt-1", isDark ? "text-zinc-600" : "text-zinc-400")}>
                  Leave empty to use any available CPU. Use comma-separated list (0,1,2) or range (0-4).
                </p>
              </div>
            </div>

            <div className={cardClasses}>
              <h3 className={cn("text-sm font-medium mb-4", isDark ? "text-zinc-200" : "text-zinc-700")}>
                Memory Settings
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClasses}>Swap Memory</label>
                  <select
                    value={formData.swap === -1 ? "unlimited" : formData.swap === 0 ? "disabled" : "limited"}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === "unlimited") setFormData({ ...formData, swap: -1 });
                      else if (val === "disabled") setFormData({ ...formData, swap: 0 });
                      else setFormData({ ...formData, swap: formData.memory }); // Default to same as memory
                    }}
                    className={inputClasses}
                  >
                    <option value="unlimited">Unlimited</option>
                    <option value="disabled">Disabled</option>
                    <option value="limited">Limited</option>
                  </select>
                </div>
                {formData.swap > 0 && (
                  <div>
                    <label className={labelClasses}>Swap Limit (MiB)</label>
                    <input
                      type="number"
                      value={formData.swap}
                      onChange={(e) => setFormData({ ...formData, swap: parseInt(e.target.value) || 0 })}
                      min={1}
                      className={inputClasses}
                    />
                  </div>
                )}
              </div>
              <div className="mt-4 flex items-center justify-between">
                <div>
                  <label className={labelClasses}>OOM Killer</label>
                  <p className={cn("text-xs", isDark ? "text-zinc-600" : "text-zinc-400")}>
                    When disabled, container won't be killed when out of memory
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={cn("text-xs", isDark ? "text-zinc-500" : "text-zinc-400")}>
                    {formData.oomKillDisable ? "Disabled" : "Enabled"}
                  </span>
                  <Switch
                    checked={formData.oomKillDisable}
                    onCheckedChange={(checked) => setFormData({ ...formData, oomKillDisable: checked })}
                  />
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Allocations Tab */}
          <TabsContent value="allocations" className="mt-6 space-y-4">
            <div className={cardClasses}>
              <h3 className={cn("text-sm font-medium mb-4", isDark ? "text-zinc-200" : "text-zinc-700")}>
                Select Node
              </h3>
              <select
                value={formData.nodeId}
                onChange={(e) => setFormData({ ...formData, nodeId: e.target.value, allocationIds: [] })}
                className={inputClasses}
                required
              >
                <option value="">Select node...</option>
                {nodesList.map((node) => (
                  <option key={node.id} value={node.id}>
                    {node.displayName} ({node.host}:{node.port}) - {node.location?.name || "Unknown"}
                  </option>
                ))}
              </select>
            </div>

            {selectedNode && (
              <div className={cardClasses}>
                <h3 className={cn("text-sm font-medium mb-4", isDark ? "text-zinc-200" : "text-zinc-700")}>
                  Available Allocations
                </h3>
                {!selectedNode.allocations || selectedNode.allocations.length === 0 ? (
                  <div className={cn("text-sm py-8 text-center", isDark ? "text-zinc-500" : "text-zinc-400")}>
                    No allocations available on this node. Add allocations in the Nodes section.
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    {selectedNode.allocations
                      .filter(a => !a.assigned || formData.allocationIds.includes(a.id))
                      .map((allocation) => (
                        <label
                          key={allocation.id}
                          className={cn(
                            "flex items-center gap-2 p-3 border cursor-pointer transition-colors",
                            formData.allocationIds.includes(allocation.id)
                              ? isDark
                                ? "border-green-600 bg-green-900/20"
                                : "border-green-400 bg-green-50"
                              : isDark
                                ? "border-zinc-700 hover:border-zinc-600"
                                : "border-zinc-200 hover:border-zinc-300"
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={formData.allocationIds.includes(allocation.id)}
                            onChange={() => toggleAllocation(allocation.id)}
                            className="w-4 h-4"
                          />
                          <div>
                            <span className={cn("text-sm font-mono", isDark ? "text-zinc-300" : "text-zinc-700")}>
                              {allocation.ip}:{allocation.port}
                            </span>
                            {allocation.alias && (
                              <span className={cn("block text-xs", isDark ? "text-zinc-500" : "text-zinc-400")}>
                                {allocation.alias}
                              </span>
                            )}
                          </div>
                        </label>
                      ))}
                  </div>
                )}
              </div>
            )}
          </TabsContent>

          {/* Blueprint Tab */}
          <TabsContent value="blueprint" className="mt-6 space-y-4">
            <div className={cardClasses}>
              <h3 className={cn("text-sm font-medium mb-4", isDark ? "text-zinc-200" : "text-zinc-700")}>
                Select Blueprint
              </h3>
              <select
                value={formData.blueprintId}
                onChange={(e) => setFormData({ ...formData, blueprintId: e.target.value })}
                className={inputClasses}
                required
              >
                <option value="">Select a blueprint...</option>
                {blueprintsList.map((blueprint) => (
                  <option key={blueprint.id} value={blueprint.id}>
                    {blueprint.name} - {blueprint.imageName}:{blueprint.imageTag}
                  </option>
                ))}
              </select>
              {selectedBlueprint && (
                <div className={cn("mt-3 p-3 border text-xs", isDark ? "border-zinc-700 bg-zinc-900/50" : "border-zinc-200 bg-zinc-50")}>
                  {selectedBlueprint.description && (
                    <p className={isDark ? "text-zinc-400" : "text-zinc-600"}>{selectedBlueprint.description}</p>
                  )}
                  <div className="flex flex-wrap gap-2 mt-2">
                    {selectedBlueprint.dockerImages && Object.keys(selectedBlueprint.dockerImages).length > 0 && (
                      <span className={cn("px-1.5 py-0.5 text-[10px]", isDark ? "bg-zinc-800 text-zinc-500" : "bg-zinc-200 text-zinc-500")}>
                        {Object.keys(selectedBlueprint.dockerImages).length} docker images
                      </span>
                    )}
                    {selectedBlueprint.variables && selectedBlueprint.variables.length > 0 && (
                      <span className={cn("px-1.5 py-0.5 text-[10px]", isDark ? "bg-zinc-800 text-zinc-500" : "bg-zinc-200 text-zinc-500")}>
                        {selectedBlueprint.variables.length} variables
                      </span>
                    )}
                    {selectedBlueprint.startup && (
                      <span className={cn("px-1.5 py-0.5 text-[10px]", isDark ? "bg-zinc-800 text-zinc-500" : "bg-zinc-200 text-zinc-500")}>
                        startup command
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Docker Image Selection */}
            {selectedBlueprint?.dockerImages && Object.keys(selectedBlueprint.dockerImages).length > 0 && (
              <div className={cardClasses}>
                <h3 className={cn("text-sm font-medium mb-4 flex items-center gap-2", isDark ? "text-zinc-200" : "text-zinc-700")}>
                  <ImageIcon className="w-4 h-4" />
                  Docker Image
                </h3>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(selectedBlueprint.dockerImages).map(([label, image]) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => setSelectedDockerImage(image)}
                      className={cn(
                        "px-3 py-2 text-xs font-medium uppercase tracking-wider border transition-all",
                        selectedDockerImage === image
                          ? isDark
                            ? "border-purple-500 bg-purple-500/20 text-purple-300"
                            : "border-purple-500 bg-purple-50 text-purple-700"
                          : isDark
                            ? "border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
                            : "border-zinc-300 text-zinc-600 hover:border-zinc-400 hover:text-zinc-800"
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <p className={cn("text-[10px] mt-2 font-mono", isDark ? "text-zinc-600" : "text-zinc-400")}>
                  {selectedDockerImage}
                </p>
              </div>
            )}

            {/* Startup Variables */}
            {selectedBlueprint?.variables && selectedBlueprint.variables.length > 0 && (
              <div className={cardClasses}>
                <h3 className={cn("text-sm font-medium mb-4 flex items-center gap-2", isDark ? "text-zinc-200" : "text-zinc-700")}>
                  <VariableIcon className="w-4 h-4" />
                  Startup Variables
                </h3>
                <div className="space-y-4">
                  {selectedBlueprint.variables
                    .filter((v: any) => v.user_viewable !== false)
                    .map((variable: any) => (
                      <div key={variable.env_variable}>
                        <div className="flex items-center gap-2 mb-1">
                          <label className={labelClasses}>{variable.name}</label>
                          <span className={cn("text-[10px] font-mono px-1.5 py-0.5 border", isDark ? "border-zinc-700 text-zinc-600" : "border-zinc-300 text-zinc-400")}>
                            {variable.env_variable}
                          </span>
                          {variable.user_editable === false && (
                            <span className={cn("text-[10px] px-1.5 py-0.5", isDark ? "bg-zinc-800 text-zinc-500" : "bg-zinc-200 text-zinc-500")}>
                              read only
                            </span>
                          )}
                        </div>
                        {variable.description && (
                          <p className={cn("text-[11px] mb-2", isDark ? "text-zinc-500" : "text-zinc-400")}>
                            {variable.description}
                          </p>
                        )}
                        <input
                          type="text"
                          value={variableValues[variable.env_variable] || ""}
                          onChange={(e) => setVariableValues(prev => ({
                            ...prev,
                            [variable.env_variable]: e.target.value
                          }))}
                          disabled={variable.user_editable === false}
                          placeholder={variable.default_value || ""}
                          className={cn(
                            inputClasses,
                            "font-mono text-sm",
                            variable.user_editable === false && "opacity-60 cursor-not-allowed"
                          )}
                        />
                        <div className={cn("flex items-center gap-2 mt-1 text-[10px]", isDark ? "text-zinc-600" : "text-zinc-400")}>
                          <span>Default: {variable.default_value || "(empty)"}</span>
                          {variable.rules && (
                            <>
                              <span>|</span>
                              <span>Rules: {variable.rules}</span>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>

              {/* Submit Button */}
              <div className={cn(
                "flex justify-end gap-3 mt-6 pt-6 border-t",
                isDark ? "border-zinc-700/50" : "border-zinc-200"
              )}>
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
                  disabled={isSubmitting}
                  className={cn(
                    "flex items-center gap-2 text-xs uppercase tracking-wider transition-all hover:scale-[1.02] active:scale-95",
                    isDark
                      ? "bg-zinc-100 text-zinc-900 hover:bg-zinc-200"
                      : "bg-zinc-800 text-zinc-100 hover:bg-zinc-700"
                  )}
                >
                  <ServerIcon className="w-4 h-4" />
                  {isSubmitting ? "Creating..." : "Create Server"}
                </Button>
              </div>
            </form>
          </FadeIn>
        </div>
      </div>
    </div>
  );
}
