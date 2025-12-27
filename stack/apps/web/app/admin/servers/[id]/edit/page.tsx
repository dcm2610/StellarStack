"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useTheme as useNextTheme } from "next-themes";
import { cn } from "@workspace/ui/lib/utils";
import { Button } from "@workspace/ui/components/button";
import { AnimatedBackground } from "@workspace/ui/components/shared/AnimatedBackground";
import { FadeIn, FloatingDots } from "@workspace/ui/components/shared/Animations";
import { ArrowLeftIcon, ServerIcon, SaveIcon } from "lucide-react";
import { servers } from "@/lib/api";
import type { Server } from "@/lib/api";
import { toast } from "sonner";

export default function EditServerPage() {
  const router = useRouter();
  const params = useParams();
  const serverId = params.id as string;
  const { resolvedTheme } = useNextTheme();
  const [mounted, setMounted] = useState(false);
  const [server, setServer] = useState<Server | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const fetchServer = async () => {
      try {
        const serverData = await servers.get(serverId);
        setServer(serverData);
        setFormData({
          name: serverData.name,
          description: serverData.description || "",
          memory: serverData.memory,
          disk: serverData.disk,
          cpu: serverData.cpu,
          cpuPinning: serverData.cpuPinning || "",
          swap: serverData.swap,
          oomKillDisable: serverData.oomKillDisable,
          backupLimit: serverData.backupLimit,
        });
      } catch (error) {
        toast.error("Failed to fetch server");
        router.push("/admin/servers");
      } finally {
        setIsLoading(false);
      }
    };

    fetchServer();
  }, [serverId, router]);

  const isDark = mounted ? resolvedTheme === "dark" : true;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      await servers.update(serverId, {
        name: formData.name,
        description: formData.description || undefined,
        memory: formData.memory,
        disk: formData.disk,
        cpu: formData.cpu,
        cpuPinning: formData.cpuPinning || null,
        swap: formData.swap,
        oomKillDisable: formData.oomKillDisable,
        backupLimit: formData.backupLimit,
      });
      toast.success("Server updated successfully");
      router.push("/admin/servers");
    } catch (error: any) {
      toast.error(error.message || "Failed to update server");
    } finally {
      setIsSubmitting(false);
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

  if (isLoading || !mounted) {
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
                {/* Corner decorations */}
                <div className={cn("absolute top-0 left-0 w-3 h-3 border-t border-l", isDark ? "border-zinc-500" : "border-zinc-400")} />
                <div className={cn("absolute top-0 right-0 w-3 h-3 border-t border-r", isDark ? "border-zinc-500" : "border-zinc-400")} />
                <div className={cn("absolute bottom-0 left-0 w-3 h-3 border-b border-l", isDark ? "border-zinc-500" : "border-zinc-400")} />
                <div className={cn("absolute bottom-0 right-0 w-3 h-3 border-b border-r", isDark ? "border-zinc-500" : "border-zinc-400")} />

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
                  disabled={isSubmitting}
                  className={cn(
                    "flex items-center gap-2 text-xs uppercase tracking-wider transition-all hover:scale-[1.02] active:scale-95",
                    isDark
                      ? "bg-zinc-100 text-zinc-900 hover:bg-zinc-200"
                      : "bg-zinc-800 text-zinc-100 hover:bg-zinc-700"
                  )}
                >
                  <SaveIcon className="w-4 h-4" />
                  {isSubmitting ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </form>
          </FadeIn>
        </div>
      </div>
    </div>
  );
}
