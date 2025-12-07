"use client";

import { useState, useEffect, type JSX } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTheme as useNextTheme } from "next-themes";
import { cn } from "@workspace/ui/lib/utils";
import { Button } from "@workspace/ui/components/button";
import { AnimatedBackground } from "@workspace/ui/components/shared/AnimatedBackground";
import { FloatingDots } from "@workspace/ui/components/shared/Animations";
import { SidebarTrigger } from "@workspace/ui/components/sidebar";
import { BsSun, BsMoon, BsExclamationTriangle } from "react-icons/bs";

interface ServerSettings {
  name: string;
  description: string;
  dockerImage: string;
  cpuLimit: number;
  memoryLimit: number;
  diskLimit: number;
  oomDisabled: boolean;
}

const SettingsPage = (): JSX.Element | null => {
  const params = useParams();
  const router = useRouter();
  const serverId = params.id as string;
  const { setTheme, resolvedTheme } = useNextTheme();
  const [mounted, setMounted] = useState(false);
  const [settings, setSettings] = useState<ServerSettings>({
    name: "US-WEST-NODE-1",
    description: "Primary Minecraft server for US West region",
    dockerImage: "ghcr.io/pterodactyl/yolks:java_17",
    cpuLimit: 200,
    memoryLimit: 4096,
    diskLimit: 10240,
    oomDisabled: false,
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = mounted ? resolvedTheme === "dark" : true;

  if (!mounted) return null;

  const handleSettingChange = <K extends keyof ServerSettings>(key: K, value: ServerSettings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  return (
    <div className={cn(
      "min-h-svh transition-colors relative",
      isDark ? "bg-[#0b0b0a]" : "bg-[#f5f5f4]"
    )}>
      <AnimatedBackground isDark={isDark} />
      <FloatingDots isDark={isDark} count={15} />

      <div className="relative p-8">
        <div className="max-w-4xl mx-auto">
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
                  SERVER SETTINGS
                </h1>
                <p className={cn(
                  "text-sm mt-1",
                  isDark ? "text-zinc-500" : "text-zinc-500"
                )}>
                  Server {serverId} • Configuration
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className={cn(
                  "transition-all gap-2",
                  isDark
                    ? "border-zinc-700 text-zinc-400 hover:text-zinc-100 hover:border-zinc-500"
                    : "border-zinc-300 text-zinc-600 hover:text-zinc-900 hover:border-zinc-400"
                )}
              >
                <span className="text-xs uppercase tracking-wider">Save Changes</span>
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

          {/* General Settings */}
          <div className={cn(
            "relative p-6 border mb-6",
            isDark
              ? "bg-gradient-to-b from-[#141414] via-[#0f0f0f] to-[#0a0a0a] border-zinc-200/10"
              : "bg-gradient-to-b from-white via-zinc-50 to-zinc-100 border-zinc-300"
          )}>
            <div className={cn("absolute top-0 left-0 w-2 h-2 border-t border-l", isDark ? "border-zinc-500" : "border-zinc-400")} />
            <div className={cn("absolute top-0 right-0 w-2 h-2 border-t border-r", isDark ? "border-zinc-500" : "border-zinc-400")} />
            <div className={cn("absolute bottom-0 left-0 w-2 h-2 border-b border-l", isDark ? "border-zinc-500" : "border-zinc-400")} />
            <div className={cn("absolute bottom-0 right-0 w-2 h-2 border-b border-r", isDark ? "border-zinc-500" : "border-zinc-400")} />

            <h2 className={cn(
              "text-sm font-medium uppercase tracking-wider mb-6",
              isDark ? "text-zinc-300" : "text-zinc-700"
            )}>
              General
            </h2>

            <div className="space-y-4">
              <div>
                <label className={cn(
                  "text-[10px] font-medium uppercase tracking-wider",
                  isDark ? "text-zinc-500" : "text-zinc-400"
                )}>
                  Server Name
                </label>
                <input
                  type="text"
                  value={settings.name}
                  onChange={(e) => handleSettingChange("name", e.target.value)}
                  className={cn(
                    "w-full mt-2 px-3 py-2 text-sm border outline-none transition-colors",
                    isDark
                      ? "bg-zinc-900/50 border-zinc-700/50 text-zinc-200 focus:border-zinc-500"
                      : "bg-white border-zinc-300 text-zinc-800 focus:border-zinc-400"
                  )}
                />
              </div>
              <div>
                <label className={cn(
                  "text-[10px] font-medium uppercase tracking-wider",
                  isDark ? "text-zinc-500" : "text-zinc-400"
                )}>
                  Description
                </label>
                <textarea
                  value={settings.description}
                  onChange={(e) => handleSettingChange("description", e.target.value)}
                  rows={3}
                  className={cn(
                    "w-full mt-2 px-3 py-2 text-sm border outline-none transition-colors resize-none",
                    isDark
                      ? "bg-zinc-900/50 border-zinc-700/50 text-zinc-200 focus:border-zinc-500"
                      : "bg-white border-zinc-300 text-zinc-800 focus:border-zinc-400"
                  )}
                />
              </div>
              <div>
                <label className={cn(
                  "text-[10px] font-medium uppercase tracking-wider",
                  isDark ? "text-zinc-500" : "text-zinc-400"
                )}>
                  Docker Image
                </label>
                <input
                  type="text"
                  value={settings.dockerImage}
                  onChange={(e) => handleSettingChange("dockerImage", e.target.value)}
                  className={cn(
                    "w-full mt-2 px-3 py-2 text-sm font-mono border outline-none transition-colors",
                    isDark
                      ? "bg-zinc-900/50 border-zinc-700/50 text-zinc-200 focus:border-zinc-500"
                      : "bg-white border-zinc-300 text-zinc-800 focus:border-zinc-400"
                  )}
                />
              </div>
            </div>
          </div>

          {/* Resource Limits */}
          <div className={cn(
            "relative p-6 border mb-6",
            isDark
              ? "bg-gradient-to-b from-[#141414] via-[#0f0f0f] to-[#0a0a0a] border-zinc-200/10"
              : "bg-gradient-to-b from-white via-zinc-50 to-zinc-100 border-zinc-300"
          )}>
            <div className={cn("absolute top-0 left-0 w-2 h-2 border-t border-l", isDark ? "border-zinc-500" : "border-zinc-400")} />
            <div className={cn("absolute top-0 right-0 w-2 h-2 border-t border-r", isDark ? "border-zinc-500" : "border-zinc-400")} />
            <div className={cn("absolute bottom-0 left-0 w-2 h-2 border-b border-l", isDark ? "border-zinc-500" : "border-zinc-400")} />
            <div className={cn("absolute bottom-0 right-0 w-2 h-2 border-b border-r", isDark ? "border-zinc-500" : "border-zinc-400")} />

            <h2 className={cn(
              "text-sm font-medium uppercase tracking-wider mb-6",
              isDark ? "text-zinc-300" : "text-zinc-700"
            )}>
              Resource Limits
            </h2>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className={cn(
                  "text-[10px] font-medium uppercase tracking-wider",
                  isDark ? "text-zinc-500" : "text-zinc-400"
                )}>
                  CPU Limit (%)
                </label>
                <input
                  type="number"
                  value={settings.cpuLimit}
                  onChange={(e) => handleSettingChange("cpuLimit", parseInt(e.target.value))}
                  className={cn(
                    "w-full mt-2 px-3 py-2 text-sm border outline-none transition-colors",
                    isDark
                      ? "bg-zinc-900/50 border-zinc-700/50 text-zinc-200 focus:border-zinc-500"
                      : "bg-white border-zinc-300 text-zinc-800 focus:border-zinc-400"
                  )}
                />
              </div>
              <div>
                <label className={cn(
                  "text-[10px] font-medium uppercase tracking-wider",
                  isDark ? "text-zinc-500" : "text-zinc-400"
                )}>
                  Memory (MB)
                </label>
                <input
                  type="number"
                  value={settings.memoryLimit}
                  onChange={(e) => handleSettingChange("memoryLimit", parseInt(e.target.value))}
                  className={cn(
                    "w-full mt-2 px-3 py-2 text-sm border outline-none transition-colors",
                    isDark
                      ? "bg-zinc-900/50 border-zinc-700/50 text-zinc-200 focus:border-zinc-500"
                      : "bg-white border-zinc-300 text-zinc-800 focus:border-zinc-400"
                  )}
                />
              </div>
              <div>
                <label className={cn(
                  "text-[10px] font-medium uppercase tracking-wider",
                  isDark ? "text-zinc-500" : "text-zinc-400"
                )}>
                  Disk (MB)
                </label>
                <input
                  type="number"
                  value={settings.diskLimit}
                  onChange={(e) => handleSettingChange("diskLimit", parseInt(e.target.value))}
                  className={cn(
                    "w-full mt-2 px-3 py-2 text-sm border outline-none transition-colors",
                    isDark
                      ? "bg-zinc-900/50 border-zinc-700/50 text-zinc-200 focus:border-zinc-500"
                      : "bg-white border-zinc-300 text-zinc-800 focus:border-zinc-400"
                  )}
                />
              </div>
            </div>

            <div className="mt-4">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.oomDisabled}
                  onChange={(e) => handleSettingChange("oomDisabled", e.target.checked)}
                  className={cn(
                    "w-4 h-4 border appearance-none cursor-pointer checked:bg-zinc-500",
                    isDark ? "border-zinc-600 bg-zinc-800" : "border-zinc-400 bg-white"
                  )}
                />
                <span className={cn(
                  "text-sm",
                  isDark ? "text-zinc-300" : "text-zinc-700"
                )}>
                  Disable OOM Killer
                </span>
              </label>
            </div>
          </div>

          {/* Danger Zone */}
          <div className={cn(
            "relative p-6 border",
            isDark
              ? "bg-gradient-to-b from-red-950/20 via-[#0f0f0f] to-[#0a0a0a] border-red-900/30"
              : "bg-gradient-to-b from-red-50 via-zinc-50 to-zinc-100 border-red-200"
          )}>
            <div className={cn("absolute top-0 left-0 w-2 h-2 border-t border-l", isDark ? "border-red-800" : "border-red-300")} />
            <div className={cn("absolute top-0 right-0 w-2 h-2 border-t border-r", isDark ? "border-red-800" : "border-red-300")} />
            <div className={cn("absolute bottom-0 left-0 w-2 h-2 border-b border-l", isDark ? "border-red-800" : "border-red-300")} />
            <div className={cn("absolute bottom-0 right-0 w-2 h-2 border-b border-r", isDark ? "border-red-800" : "border-red-300")} />

            <div className="flex items-center gap-2 mb-6">
              <BsExclamationTriangle className={cn("w-4 h-4", isDark ? "text-red-400" : "text-red-600")} />
              <h2 className={cn(
                "text-sm font-medium uppercase tracking-wider",
                isDark ? "text-red-400" : "text-red-700"
              )}>
                Danger Zone
              </h2>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <h3 className={cn(
                  "text-sm font-medium",
                  isDark ? "text-zinc-200" : "text-zinc-700"
                )}>
                  Reinstall Server
                </h3>
                <p className={cn(
                  "text-xs mt-1",
                  isDark ? "text-zinc-500" : "text-zinc-500"
                )}>
                  This will reinstall the server with its current configuration
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className={cn(
                  "transition-all",
                  isDark
                    ? "border-red-900/60 text-red-400/80 hover:text-red-300 hover:border-red-700"
                    : "border-red-300 text-red-600 hover:text-red-700 hover:border-red-400"
                )}
              >
                <span className="text-xs uppercase tracking-wider">Reinstall</span>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
