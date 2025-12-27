"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme as useNextTheme } from "next-themes";
import { cn } from "@workspace/ui/lib/utils";
import { Button } from "@workspace/ui/components/button";
import { AnimatedBackground } from "@workspace/ui/components/shared/AnimatedBackground";
import { FadeIn, FloatingDots } from "@workspace/ui/components/shared/Animations";
import { PackageIcon, PlusIcon, TrashIcon, EditIcon, EyeIcon, EyeOffIcon, UploadIcon, DownloadIcon, UserIcon, ArrowLeftIcon, VariableIcon, ImageIcon, TerminalIcon } from "lucide-react";
import { blueprints } from "@/lib/api";
import type { Blueprint, CreateBlueprintData, PterodactylEgg } from "@/lib/api";
import { toast } from "sonner";

export default function BlueprintsPage() {
  const router = useRouter();
  const { resolvedTheme } = useNextTheme();
  const [mounted, setMounted] = useState(false);
  const [blueprintsList, setBlueprintsList] = useState<Blueprint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [editingBlueprint, setEditingBlueprint] = useState<Blueprint | null>(null);
  const [showJsonEditor, setShowJsonEditor] = useState(false);
  const [importJson, setImportJson] = useState("");

  // Form state
  const [formData, setFormData] = useState<CreateBlueprintData>({
    name: "",
    description: "",
    category: "",
    imageName: "",
    imageTag: "latest",
    config: {},
    isPublic: true,
  });
  const [configJson, setConfigJson] = useState("{}");

  useEffect(() => {
    setMounted(true);
  }, []);

  const fetchData = async () => {
    try {
      const data = await blueprints.list();
      setBlueprintsList(data);
    } catch (error) {
      toast.error("Failed to fetch blueprints");
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
      name: "",
      description: "",
      category: "",
      imageName: "",
      imageTag: "latest",
      config: {},
      isPublic: true,
    });
    setConfigJson("{}");
    setEditingBlueprint(null);
    setShowJsonEditor(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // Parse JSON config
      let config = {};
      try {
        config = JSON.parse(configJson);
      } catch {
        toast.error("Invalid JSON in config");
        return;
      }

      const data = { ...formData, config };

      if (editingBlueprint) {
        await blueprints.update(editingBlueprint.id, data);
        toast.success("Blueprint updated successfully");
      } else {
        await blueprints.create(data);
        toast.success("Blueprint created successfully");
      }
      setIsModalOpen(false);
      resetForm();
      fetchData();
    } catch (error) {
      toast.error(editingBlueprint ? "Failed to update blueprint" : "Failed to create blueprint");
    }
  };

  const handleEdit = (blueprint: Blueprint) => {
    setEditingBlueprint(blueprint);
    setFormData({
      name: blueprint.name,
      description: blueprint.description || "",
      category: blueprint.category || "",
      imageName: blueprint.imageName,
      imageTag: blueprint.imageTag || "latest",
      config: blueprint.config,
      isPublic: blueprint.isPublic,
    });
    setConfigJson(JSON.stringify(blueprint.config, null, 2));
    setIsModalOpen(true);
  };

  const handleDelete = async (blueprint: Blueprint) => {
    if (!confirm(`Are you sure you want to delete "${blueprint.name}"?`)) return;
    try {
      await blueprints.delete(blueprint.id);
      toast.success("Blueprint deleted successfully");
      fetchData();
    } catch (error) {
      toast.error("Failed to delete blueprint");
    }
  };

  const handleImportEgg = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const egg = JSON.parse(importJson) as PterodactylEgg;
      const result = await blueprints.importEgg(egg);
      toast.success(result.message);
      setIsImportModalOpen(false);
      setImportJson("");
      fetchData();
    } catch (error) {
      if (error instanceof SyntaxError) {
        toast.error("Invalid JSON format");
      } else {
        toast.error("Failed to import egg");
      }
    }
  };

  const handleExportEgg = async (blueprint: Blueprint) => {
    try {
      const egg = await blueprints.exportEgg(blueprint.id);
      const blob = new Blob([JSON.stringify(egg, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${blueprint.name.toLowerCase().replace(/\s+/g, "-")}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Egg exported successfully");
    } catch {
      toast.error("Failed to export egg");
    }
  };

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setImportJson(event.target?.result as string);
      };
      reader.readAsText(file);
    }
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
                    BLUEPRINTS
                  </h1>
                  <p className={cn(
                    "text-sm mt-1",
                    isDark ? "text-zinc-500" : "text-zinc-500"
                  )}>
                    Docker container templates
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={() => setIsImportModalOpen(true)}
                  variant="outline"
                  className={cn(
                    "flex items-center gap-2 text-xs uppercase tracking-wider transition-all hover:scale-[1.02] active:scale-95",
                    isDark ? "border-zinc-700 text-zinc-400 hover:text-zinc-100" : "border-zinc-300 text-zinc-600 hover:text-zinc-900"
                  )}
                >
                  <UploadIcon className="w-4 h-4" />
                  Import Egg
                </Button>
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
                  Add Blueprint
                </Button>
              </div>
            </div>
          </FadeIn>

          {/* Blueprints Grid */}
          <FadeIn delay={0.1}>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading ? (
          <div className={cn("col-span-full text-center py-12 text-sm", isDark ? "text-zinc-500" : "text-zinc-400")}>
            Loading...
          </div>
        ) : blueprintsList.length === 0 ? (
          <div className={cn(
            "col-span-full text-center py-12 border",
            isDark ? "border-zinc-800 text-zinc-500" : "border-zinc-200 text-zinc-400"
          )}>
            No blueprints configured. Add your first blueprint.
          </div>
        ) : (
          blueprintsList.map((blueprint) => (
            <div
              key={blueprint.id}
              className={cn(
                "relative p-4 border transition-colors",
                isDark
                  ? "bg-zinc-900/50 border-zinc-700/50"
                  : "bg-white border-zinc-200"
              )}
            >
              {/* Corner accents */}
              <div className={cn("absolute top-0 left-0 w-2 h-2 border-t border-l", isDark ? "border-zinc-500" : "border-zinc-400")} />
              <div className={cn("absolute top-0 right-0 w-2 h-2 border-t border-r", isDark ? "border-zinc-500" : "border-zinc-400")} />
              <div className={cn("absolute bottom-0 left-0 w-2 h-2 border-b border-l", isDark ? "border-zinc-500" : "border-zinc-400")} />
              <div className={cn("absolute bottom-0 right-0 w-2 h-2 border-b border-r", isDark ? "border-zinc-500" : "border-zinc-400")} />

              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <PackageIcon className={cn("w-6 h-6 mt-0.5", isDark ? "text-purple-400" : "text-purple-600")} />
                  <div>
                    <div className={cn("font-medium flex items-center gap-2", isDark ? "text-zinc-100" : "text-zinc-800")}>
                      {blueprint.name}
                      {blueprint.isPublic ? (
                        <EyeIcon className={cn("w-3 h-3", isDark ? "text-zinc-500" : "text-zinc-400")} />
                      ) : (
                        <EyeOffIcon className={cn("w-3 h-3", isDark ? "text-zinc-600" : "text-zinc-400")} />
                      )}
                    </div>
                    <div className={cn("text-xs mt-1 font-mono", isDark ? "text-zinc-500" : "text-zinc-400")}>
                      {blueprint.imageName}:{blueprint.imageTag || "latest"}
                    </div>
                    {blueprint.category && (
                      <div className={cn(
                        "text-[10px] mt-2 inline-block px-1.5 py-0.5 uppercase tracking-wider",
                        isDark ? "bg-zinc-800 text-zinc-400" : "bg-zinc-100 text-zinc-600"
                      )}>
                        {blueprint.category}
                      </div>
                    )}
                    {blueprint.author && (
                      <div className={cn("text-xs mt-1 flex items-center gap-1", isDark ? "text-zinc-500" : "text-zinc-400")}>
                        <UserIcon className="w-3 h-3" />
                        {blueprint.author}
                      </div>
                    )}
                    {blueprint.description && (
                      <div className={cn("text-xs mt-2 line-clamp-2", isDark ? "text-zinc-600" : "text-zinc-400")}>
                        {blueprint.description}
                      </div>
                    )}
                    {/* Show info badges */}
                    <div className="flex flex-wrap gap-1 mt-2">
                      {blueprint.dockerImages && Object.keys(blueprint.dockerImages).length > 1 && (
                        <span className={cn("text-[10px] px-1.5 py-0.5", isDark ? "bg-zinc-800 text-zinc-500" : "bg-zinc-100 text-zinc-500")}>
                          {Object.keys(blueprint.dockerImages).length} images
                        </span>
                      )}
                      {blueprint.variables && blueprint.variables.length > 0 && (
                        <span className={cn("text-[10px] px-1.5 py-0.5", isDark ? "bg-zinc-800 text-zinc-500" : "bg-zinc-100 text-zinc-500")}>
                          {blueprint.variables.length} variables
                        </span>
                      )}
                      {blueprint.startup && (
                        <span className={cn("text-[10px] px-1.5 py-0.5", isDark ? "bg-zinc-800 text-zinc-500" : "bg-zinc-100 text-zinc-500")}>
                          startup
                        </span>
                      )}
                      {blueprint.installScript && (
                        <span className={cn("text-[10px] px-1.5 py-0.5", isDark ? "bg-zinc-800 text-zinc-500" : "bg-zinc-100 text-zinc-500")}>
                          install script
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleExportEgg(blueprint)}
                    className={cn(
                      "text-xs p-1.5",
                      isDark ? "border-zinc-700 text-zinc-400 hover:text-zinc-100" : "border-zinc-300 text-zinc-600 hover:text-zinc-900"
                    )}
                    title="Export as Pterodactyl Egg"
                  >
                    <DownloadIcon className="w-3 h-3" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleEdit(blueprint)}
                    className={cn(
                      "text-xs p-1.5",
                      isDark ? "border-zinc-700 text-zinc-400 hover:text-zinc-100" : "border-zinc-300 text-zinc-600 hover:text-zinc-900"
                    )}
                  >
                    <EditIcon className="w-3 h-3" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDelete(blueprint)}
                    className={cn(
                      "text-xs p-1.5",
                      isDark ? "border-red-900/50 text-red-400 hover:bg-red-900/20" : "border-red-200 text-red-600 hover:bg-red-50"
                    )}
                  >
                    <TrashIcon className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            </div>
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
            "relative w-full max-w-2xl mx-4 p-6 border max-h-[90vh] overflow-y-auto",
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
              {editingBlueprint ? "Edit Blueprint" : "Create Blueprint"}
            </h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClasses}>Name</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Minecraft Vanilla"
                    className={inputClasses}
                    required
                  />
                </div>
                <div>
                  <label className={labelClasses}>Category</label>
                  <input
                    type="text"
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    placeholder="gaming"
                    className={inputClasses}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClasses}>Image Name</label>
                  <input
                    type="text"
                    value={formData.imageName}
                    onChange={(e) => setFormData({ ...formData, imageName: e.target.value })}
                    placeholder="itzg/minecraft-server"
                    className={inputClasses}
                    required
                  />
                </div>
                <div>
                  <label className={labelClasses}>Image Tag</label>
                  <input
                    type="text"
                    value={formData.imageTag}
                    onChange={(e) => setFormData({ ...formData, imageTag: e.target.value })}
                    placeholder="latest"
                    className={inputClasses}
                  />
                </div>
              </div>

              <div>
                <label className={labelClasses}>Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Optional description..."
                  rows={2}
                  className={inputClasses}
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isPublic"
                  checked={formData.isPublic}
                  onChange={(e) => setFormData({ ...formData, isPublic: e.target.checked })}
                  className="w-4 h-4"
                />
                <label htmlFor="isPublic" className={cn("text-sm", isDark ? "text-zinc-300" : "text-zinc-700")}>
                  Public (visible to all users)
                </label>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className={labelClasses}>Docker Config (JSON)</label>
                  <button
                    type="button"
                    onClick={() => setShowJsonEditor(!showJsonEditor)}
                    className={cn("text-xs", isDark ? "text-zinc-500 hover:text-zinc-300" : "text-zinc-400 hover:text-zinc-600")}
                  >
                    {showJsonEditor ? "Hide" : "Show"} Editor
                  </button>
                </div>
                {showJsonEditor && (
                  <textarea
                    value={configJson}
                    onChange={(e) => setConfigJson(e.target.value)}
                    placeholder='{"environment": {"EULA": "TRUE"}, "ports": [...]}'
                    rows={10}
                    className={cn(inputClasses, "font-mono text-xs")}
                  />
                )}
                {!showJsonEditor && (
                  <div className={cn(
                    "p-3 text-xs font-mono max-h-32 overflow-auto border",
                    isDark ? "bg-zinc-900 border-zinc-700 text-zinc-400" : "bg-zinc-50 border-zinc-200 text-zinc-600"
                  )}>
                    <pre>{configJson}</pre>
                  </div>
                )}
              </div>

              {/* Docker Images (from Pterodactyl egg) */}
              {editingBlueprint?.dockerImages && Object.keys(editingBlueprint.dockerImages).length > 0 && (
                <div>
                  <label className={cn(labelClasses, "flex items-center gap-2")}>
                    <ImageIcon className="w-3 h-3" />
                    Docker Images
                  </label>
                  <div className={cn(
                    "p-3 border space-y-2",
                    isDark ? "bg-zinc-900/50 border-zinc-700" : "bg-zinc-50 border-zinc-200"
                  )}>
                    {Object.entries(editingBlueprint.dockerImages).map(([label, image]) => (
                      <div key={label} className="flex items-center justify-between gap-2">
                        <span className={cn("text-xs font-medium", isDark ? "text-zinc-300" : "text-zinc-700")}>
                          {label}
                        </span>
                        <span className={cn("text-xs font-mono", isDark ? "text-zinc-500" : "text-zinc-400")}>
                          {image}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Startup Command (from Pterodactyl egg) */}
              {editingBlueprint?.startup && (
                <div>
                  <label className={cn(labelClasses, "flex items-center gap-2")}>
                    <TerminalIcon className="w-3 h-3" />
                    Startup Command
                  </label>
                  <div className={cn(
                    "p-3 border font-mono text-xs overflow-x-auto",
                    isDark ? "bg-zinc-900/50 border-zinc-700 text-zinc-400" : "bg-zinc-50 border-zinc-200 text-zinc-600"
                  )}>
                    {editingBlueprint.startup}
                  </div>
                </div>
              )}

              {/* Variables (from Pterodactyl egg) */}
              {editingBlueprint?.variables && editingBlueprint.variables.length > 0 && (
                <div>
                  <label className={cn(labelClasses, "flex items-center gap-2")}>
                    <VariableIcon className="w-3 h-3" />
                    Variables ({editingBlueprint.variables.length})
                  </label>
                  <div className={cn(
                    "border divide-y max-h-64 overflow-y-auto",
                    isDark ? "bg-zinc-900/50 border-zinc-700 divide-zinc-700/50" : "bg-zinc-50 border-zinc-200 divide-zinc-200"
                  )}>
                    {editingBlueprint.variables.map((variable) => (
                      <div key={variable.env_variable} className="p-3">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className={cn("text-xs font-medium", isDark ? "text-zinc-200" : "text-zinc-800")}>
                            {variable.name}
                          </span>
                          <span className={cn("text-[10px] font-mono px-1.5 py-0.5 border", isDark ? "border-zinc-700 text-zinc-500" : "border-zinc-300 text-zinc-500")}>
                            {variable.env_variable}
                          </span>
                        </div>
                        {variable.description && (
                          <p className={cn("text-[11px] mb-2", isDark ? "text-zinc-500" : "text-zinc-400")}>
                            {variable.description}
                          </p>
                        )}
                        <div className="flex items-center gap-4 text-[10px]">
                          <span className={isDark ? "text-zinc-600" : "text-zinc-400"}>
                            Default: <span className="font-mono">{variable.default_value || "(empty)"}</span>
                          </span>
                          {variable.rules && (
                            <span className={isDark ? "text-zinc-600" : "text-zinc-400"}>
                              Rules: {variable.rules}
                            </span>
                          )}
                          <div className="flex gap-2">
                            {variable.user_viewable && (
                              <span className={cn("px-1 py-0.5", isDark ? "bg-zinc-800 text-zinc-500" : "bg-zinc-200 text-zinc-500")}>
                                viewable
                              </span>
                            )}
                            {variable.user_editable && (
                              <span className={cn("px-1 py-0.5", isDark ? "bg-zinc-800 text-zinc-500" : "bg-zinc-200 text-zinc-500")}>
                                editable
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className={cn("text-[10px] mt-1", isDark ? "text-zinc-600" : "text-zinc-400")}>
                    Variables are imported from Pterodactyl eggs and can be overridden per-server.
                  </p>
                </div>
              )}

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
                  {editingBlueprint ? "Update" : "Create"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Import Egg Modal */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className={cn(
            "relative w-full max-w-2xl mx-4 p-6 border max-h-[90vh] overflow-y-auto",
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
              "text-lg font-light tracking-wider mb-2",
              isDark ? "text-zinc-100" : "text-zinc-800"
            )}>
              Import Pterodactyl Egg
            </h2>
            <p className={cn("text-sm mb-6", isDark ? "text-zinc-500" : "text-zinc-500")}>
              Paste the contents of a Pterodactyl egg JSON file or upload a file.
            </p>

            <form onSubmit={handleImportEgg} className="space-y-4">
              <div>
                <label className={labelClasses}>Upload File</label>
                <input
                  type="file"
                  accept=".json"
                  onChange={handleFileImport}
                  className={cn(
                    "w-full text-sm file:mr-4 file:py-2 file:px-4 file:border-0 file:text-sm file:font-medium",
                    isDark
                      ? "file:bg-zinc-800 file:text-zinc-300 text-zinc-400"
                      : "file:bg-zinc-100 file:text-zinc-700 text-zinc-600"
                  )}
                />
              </div>

              <div>
                <label className={labelClasses}>Or Paste JSON</label>
                <textarea
                  value={importJson}
                  onChange={(e) => setImportJson(e.target.value)}
                  placeholder='{"name": "Paper", "docker_images": {...}, ...}'
                  rows={15}
                  className={cn(inputClasses, "font-mono text-xs")}
                  required
                />
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => { setIsImportModalOpen(false); setImportJson(""); }}
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
                  Import
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
