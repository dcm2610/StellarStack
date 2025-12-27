"use client";

import { useState, useEffect, type JSX } from "react";
import { useParams } from "next/navigation";
import { useTheme as useNextTheme } from "next-themes";
import { cn } from "@workspace/ui/lib/utils";
import { Button } from "@workspace/ui/components/button";
import { AnimatedBackground } from "@workspace/ui/components/shared/AnimatedBackground";
import { FloatingDots } from "@workspace/ui/components/shared/Animations";
import { SidebarTrigger } from "@workspace/ui/components/sidebar";
import { ConfirmationModal } from "@workspace/ui/components/shared/ConfirmationModal";
import { Spinner } from "@workspace/ui/components/spinner";
import { BsSun, BsMoon, BsInfoCircle, BsCheckCircle, BsArrowRepeat } from "react-icons/bs";
import { servers } from "@/lib/api";
import type { StartupVariable, DockerImageOption } from "@/lib/api";
import { toast } from "sonner";

const StartupPage = (): JSX.Element | null => {
  const params = useParams();
  const serverId = params.id as string;
  const { setTheme, resolvedTheme } = useNextTheme();
  const [mounted, setMounted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Startup configuration state
  const [variables, setVariables] = useState<StartupVariable[]>([]);
  const [originalVariables, setOriginalVariables] = useState<StartupVariable[]>([]);
  const [dockerImages, setDockerImages] = useState<DockerImageOption[]>([]);
  const [selectedDockerImage, setSelectedDockerImage] = useState("");
  const [originalDockerImage, setOriginalDockerImage] = useState("");
  const [startupCommand, setStartupCommand] = useState("");
  const [features, setFeatures] = useState<string[]>([]);

  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [reinstallModalOpen, setReinstallModalOpen] = useState(false);
  const [isReinstalling, setIsReinstalling] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (serverId) {
      fetchStartupConfig();
    }
  }, [serverId]);

  const fetchStartupConfig = async () => {
    try {
      setIsLoading(true);
      const config = await servers.startup.get(serverId);
      setVariables(config.variables);
      setOriginalVariables(JSON.parse(JSON.stringify(config.variables)));
      setDockerImages(config.dockerImages);
      setSelectedDockerImage(config.selectedDockerImage);
      setOriginalDockerImage(config.selectedDockerImage);
      setStartupCommand(config.startupCommand);
      setFeatures(config.features);
    } catch (error) {
      toast.error("Failed to load startup configuration");
    } finally {
      setIsLoading(false);
    }
  };

  const isDark = mounted ? resolvedTheme === "dark" : true;

  if (!mounted) return null;

  const handleVariableChange = (envVariable: string, value: string) => {
    setVariables(prev => prev.map(v =>
      v.envVariable === envVariable ? { ...v, value } : v
    ));
    setSaved(false);
  };

  const handleDockerImageChange = (image: string) => {
    setSelectedDockerImage(image);
    setSaved(false);
  };

  const hasChanges =
    JSON.stringify(variables) !== JSON.stringify(originalVariables) ||
    selectedDockerImage !== originalDockerImage;

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // Build variables object
      const variablesMap: Record<string, string> = {};
      variables.forEach(v => {
        if (v.userEditable) {
          variablesMap[v.envVariable] = v.value;
        }
      });

      await servers.startup.update(serverId, {
        variables: variablesMap,
        dockerImage: selectedDockerImage,
      });

      setOriginalVariables(JSON.parse(JSON.stringify(variables)));
      setOriginalDockerImage(selectedDockerImage);
      setSaveModalOpen(false);
      setSaved(true);
      toast.success("Startup configuration saved");
      setTimeout(() => setSaved(false), 2000);

      // Refresh to get updated startup command
      fetchStartupConfig();
    } catch (error) {
      toast.error("Failed to save configuration");
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setVariables(JSON.parse(JSON.stringify(originalVariables)));
    setSelectedDockerImage(originalDockerImage);
  };

  const handleReinstall = async () => {
    setIsReinstalling(true);
    try {
      await servers.reinstall(serverId);
      setReinstallModalOpen(false);
      toast.success("Server reinstalled successfully with new configuration");
    } catch (error) {
      toast.error("Failed to reinstall server");
    } finally {
      setIsReinstalling(false);
    }
  };

  // Build the startup command preview with current values
  const getStartupCommandPreview = () => {
    let command = startupCommand;
    variables.forEach(v => {
      const regex = new RegExp(`\\{\\{${v.envVariable}\\}\\}`, 'g');
      command = command.replace(regex, v.value);
    });
    return command;
  };

  if (isLoading) {
    return (
      <div className={cn(
        "min-h-full transition-colors relative flex items-center justify-center",
        isDark ? "bg-[#0b0b0a]" : "bg-[#f5f5f4]"
      )}>
        <AnimatedBackground isDark={isDark} />
        <Spinner className="w-8 h-8" />
      </div>
    );
  }

  return (
    <div className={cn(
      "min-h-full transition-colors relative",
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
                  STARTUP PARAMETERS
                </h1>
                <p className={cn(
                  "text-sm mt-1",
                  isDark ? "text-zinc-500" : "text-zinc-500"
                )}>
                  Configure startup variables and Docker image
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {hasChanges && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleReset}
                  className={cn(
                    "transition-all gap-2",
                    isDark
                      ? "border-zinc-700 text-zinc-400 hover:text-zinc-100 hover:border-zinc-500"
                      : "border-zinc-300 text-zinc-600 hover:text-zinc-900 hover:border-zinc-400"
                  )}
                >
                  <span className="text-xs uppercase tracking-wider">Reset</span>
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSaveModalOpen(true)}
                disabled={!hasChanges}
                className={cn(
                  "transition-all gap-2",
                  saved
                    ? isDark
                      ? "border-green-500/50 text-green-400"
                      : "border-green-400 text-green-600"
                    : isDark
                      ? "border-zinc-700 text-zinc-400 hover:text-zinc-100 hover:border-zinc-500 disabled:opacity-40"
                      : "border-zinc-300 text-zinc-600 hover:text-zinc-900 hover:border-zinc-400 disabled:opacity-40"
                )}
              >
                {saved ? (
                  <>
                    <BsCheckCircle className="w-4 h-4" />
                    <span className="text-xs uppercase tracking-wider">Saved</span>
                  </>
                ) : (
                  <span className="text-xs uppercase tracking-wider">Save Changes</span>
                )}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setReinstallModalOpen(true)}
                disabled={hasChanges}
                className={cn(
                  "transition-all gap-2",
                  isDark
                    ? "border-zinc-700 text-zinc-400 hover:text-zinc-100 hover:border-zinc-500 disabled:opacity-40"
                    : "border-zinc-300 text-zinc-600 hover:text-zinc-900 hover:border-zinc-400 disabled:opacity-40"
                )}
                title={hasChanges ? "Save changes first before reinstalling" : "Reinstall server with current configuration"}
              >
                <BsArrowRepeat className="w-4 h-4" />
                <span className="text-xs uppercase tracking-wider">Reinstall</span>
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

          {/* Docker Image Selector */}
          {dockerImages.length > 0 && (
            <div className={cn(
              "relative p-4 border mb-6",
              isDark
                ? "bg-gradient-to-b from-[#141414] via-[#0f0f0f] to-[#0a0a0a] border-zinc-200/10"
                : "bg-gradient-to-b from-white via-zinc-50 to-zinc-100 border-zinc-300"
            )}>
              <div className={cn("absolute top-0 left-0 w-2 h-2 border-t border-l", isDark ? "border-zinc-500" : "border-zinc-400")} />
              <div className={cn("absolute top-0 right-0 w-2 h-2 border-t border-r", isDark ? "border-zinc-500" : "border-zinc-400")} />
              <div className={cn("absolute bottom-0 left-0 w-2 h-2 border-b border-l", isDark ? "border-zinc-500" : "border-zinc-400")} />
              <div className={cn("absolute bottom-0 right-0 w-2 h-2 border-b border-r", isDark ? "border-zinc-500" : "border-zinc-400")} />

              <label className={cn(
                "text-[10px] font-medium uppercase tracking-wider",
                isDark ? "text-zinc-500" : "text-zinc-400"
              )}>
                Docker Image
              </label>
              <div className="mt-3 flex flex-wrap gap-2">
                {dockerImages.map((img) => (
                  <button
                    key={img.image}
                    onClick={() => handleDockerImageChange(img.image)}
                    className={cn(
                      "px-3 py-2 text-xs font-medium uppercase tracking-wider border transition-all",
                      selectedDockerImage === img.image
                        ? isDark
                          ? "border-purple-500 bg-purple-500/20 text-purple-300"
                          : "border-purple-500 bg-purple-50 text-purple-700"
                        : isDark
                          ? "border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
                          : "border-zinc-300 text-zinc-600 hover:border-zinc-400 hover:text-zinc-800"
                    )}
                  >
                    {img.label}
                  </button>
                ))}
              </div>
              <p className={cn(
                "text-[10px] mt-2 font-mono",
                isDark ? "text-zinc-600" : "text-zinc-400"
              )}>
                {selectedDockerImage}
              </p>
            </div>
          )}

          {/* Startup Command Preview */}
          <div className={cn(
            "relative p-4 border mb-6",
            isDark
              ? "bg-gradient-to-b from-[#141414] via-[#0f0f0f] to-[#0a0a0a] border-zinc-200/10"
              : "bg-gradient-to-b from-white via-zinc-50 to-zinc-100 border-zinc-300"
          )}>
            <div className={cn("absolute top-0 left-0 w-2 h-2 border-t border-l", isDark ? "border-zinc-500" : "border-zinc-400")} />
            <div className={cn("absolute top-0 right-0 w-2 h-2 border-t border-r", isDark ? "border-zinc-500" : "border-zinc-400")} />
            <div className={cn("absolute bottom-0 left-0 w-2 h-2 border-b border-l", isDark ? "border-zinc-500" : "border-zinc-400")} />
            <div className={cn("absolute bottom-0 right-0 w-2 h-2 border-b border-r", isDark ? "border-zinc-500" : "border-zinc-400")} />

            <label className={cn(
              "text-[10px] font-medium uppercase tracking-wider",
              isDark ? "text-zinc-500" : "text-zinc-400"
            )}>
              Startup Command
            </label>
            <div className={cn(
              "mt-2 p-3 font-mono text-xs border overflow-x-auto",
              isDark ? "bg-zinc-900/50 border-zinc-700/50 text-zinc-300" : "bg-zinc-100 border-zinc-200 text-zinc-700"
            )}>
              {getStartupCommandPreview() || "No startup command configured"}
            </div>
          </div>

          {/* Variables */}
          {variables.length === 0 ? (
            <div className={cn(
              "text-center py-12 border",
              isDark ? "border-zinc-800 text-zinc-500" : "border-zinc-200 text-zinc-400"
            )}>
              No startup variables configured for this blueprint.
            </div>
          ) : (
            <div className="space-y-4">
              {variables.map((variable) => (
                <div
                  key={variable.envVariable}
                  className={cn(
                    "relative p-6 border transition-all",
                    isDark
                      ? "bg-gradient-to-b from-[#141414] via-[#0f0f0f] to-[#0a0a0a] border-zinc-200/10"
                      : "bg-gradient-to-b from-white via-zinc-50 to-zinc-100 border-zinc-300"
                  )}
                >
                  {/* Corner decorations */}
                  <div className={cn("absolute top-0 left-0 w-2 h-2 border-t border-l", isDark ? "border-zinc-500" : "border-zinc-400")} />
                  <div className={cn("absolute top-0 right-0 w-2 h-2 border-t border-r", isDark ? "border-zinc-500" : "border-zinc-400")} />
                  <div className={cn("absolute bottom-0 left-0 w-2 h-2 border-b border-l", isDark ? "border-zinc-500" : "border-zinc-400")} />
                  <div className={cn("absolute bottom-0 right-0 w-2 h-2 border-b border-r", isDark ? "border-zinc-500" : "border-zinc-400")} />

                  <div className="flex items-start justify-between gap-6">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className={cn(
                          "text-sm font-medium uppercase tracking-wider",
                          isDark ? "text-zinc-100" : "text-zinc-800"
                        )}>
                          {variable.name}
                        </h3>
                        <span className={cn(
                          "text-[10px] font-mono px-2 py-0.5 border",
                          isDark ? "border-zinc-700 text-zinc-500" : "border-zinc-300 text-zinc-500"
                        )}>
                          {variable.envVariable}
                        </span>
                        {!variable.userEditable && (
                          <span className={cn(
                            "text-[10px] px-2 py-0.5 uppercase tracking-wider",
                            isDark ? "bg-zinc-800 text-zinc-500" : "bg-zinc-200 text-zinc-500"
                          )}>
                            Read Only
                          </span>
                        )}
                      </div>
                      <p className={cn(
                        "text-xs mb-4",
                        isDark ? "text-zinc-500" : "text-zinc-500"
                      )}>
                        {variable.description}
                      </p>
                      <input
                        type="text"
                        value={variable.value}
                        onChange={(e) => handleVariableChange(variable.envVariable, e.target.value)}
                        disabled={!variable.userEditable}
                        className={cn(
                          "w-full px-3 py-2 text-sm font-mono border outline-none transition-colors",
                          !variable.userEditable && "opacity-60 cursor-not-allowed",
                          isDark
                            ? "bg-zinc-900/50 border-zinc-700/50 text-zinc-200 focus:border-zinc-500 placeholder:text-zinc-600 disabled:bg-zinc-800/50"
                            : "bg-white border-zinc-300 text-zinc-800 focus:border-zinc-400 placeholder:text-zinc-400 disabled:bg-zinc-100"
                        )}
                        placeholder={variable.defaultValue}
                      />
                      <div className={cn(
                        "flex items-center gap-1 mt-2 text-[10px]",
                        isDark ? "text-zinc-600" : "text-zinc-400"
                      )}>
                        <BsInfoCircle className="w-3 h-3" />
                        <span>Default: {variable.defaultValue || "(empty)"}</span>
                        {variable.rules && (
                          <>
                            <span className="mx-1">|</span>
                            <span>Rules: {variable.rules}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Save Confirmation Modal */}
      <ConfirmationModal
        open={saveModalOpen}
        onOpenChange={setSaveModalOpen}
        title="Save Changes"
        description="Are you sure you want to save these startup parameter changes? The server will need to be reinstalled for changes to take effect."
        onConfirm={handleSave}
        confirmLabel="Save"
        isDark={isDark}
        isLoading={isSaving}
      />

      {/* Reinstall Confirmation Modal */}
      <ConfirmationModal
        open={reinstallModalOpen}
        onOpenChange={setReinstallModalOpen}
        title="Reinstall Server"
        description="This will delete the current container and create a new one with the saved configuration. All running processes will be stopped and any unsaved data may be lost. Are you sure you want to continue?"
        onConfirm={handleReinstall}
        confirmLabel="Reinstall"
        variant="danger"
        isDark={isDark}
        isLoading={isReinstalling}
      />
    </div>
  );
};

export default StartupPage;
