"use client";

import { useState, useEffect, type JSX } from "react";
import { useParams } from "next/navigation";
import { useTheme as useNextTheme } from "next-themes";
import { cn } from "@workspace/ui/lib/utils";
import { Button } from "@workspace/ui/components/button";
import { AnimatedBackground } from "@workspace/ui/components/shared/AnimatedBackground";
import { FloatingDots } from "@workspace/ui/components/shared/Animations";
import { SidebarTrigger } from "@workspace/ui/components/sidebar";
import { BsSun, BsMoon, BsPlus, BsTrash, BsGlobe, BsHddNetwork } from "react-icons/bs";

interface PortAllocation {
  id: string;
  port: number;
  protocol: "tcp" | "udp" | "both";
  description: string;
  primary: boolean;
}

interface Subdomain {
  id: string;
  subdomain: string;
  domain: string;
  targetPort: number;
  ssl: boolean;
}

const mockPorts: PortAllocation[] = [
  { id: "port-1", port: 25565, protocol: "tcp", description: "Minecraft Server", primary: true },
  { id: "port-2", port: 25566, protocol: "udp", description: "Voice Chat", primary: false },
  { id: "port-3", port: 8123, protocol: "tcp", description: "Dynmap Web", primary: false },
];

const mockSubdomains: Subdomain[] = [
  { id: "sub-1", subdomain: "mc", domain: "stellarstack.io", targetPort: 25565, ssl: true },
  { id: "sub-2", subdomain: "map", domain: "stellarstack.io", targetPort: 8123, ssl: true },
];

const NetworkPage = (): JSX.Element | null => {
  const params = useParams();
  const serverId = params.id as string;
  const { setTheme, resolvedTheme } = useNextTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = mounted ? resolvedTheme === "dark" : true;

  if (!mounted) return null;

  return (
    <div className={cn(
      "min-h-svh transition-colors relative",
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
                  NETWORK
                </h1>
                <p className={cn(
                  "text-sm mt-1",
                  isDark ? "text-zinc-500" : "text-zinc-500"
                )}>
                  Server {serverId} • Port allocation & subdomains
                </p>
              </div>
            </div>
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

          {/* Port Allocations Section */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <BsHddNetwork className={cn("w-5 h-5", isDark ? "text-zinc-400" : "text-zinc-600")} />
                <h2 className={cn(
                  "text-sm font-medium uppercase tracking-wider",
                  isDark ? "text-zinc-300" : "text-zinc-700"
                )}>
                  Port Allocations
                </h2>
              </div>
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
                <BsPlus className="w-4 h-4" />
                <span className="text-xs uppercase tracking-wider">Add Port</span>
              </Button>
            </div>

            <div className="space-y-3">
              {mockPorts.map((port) => (
                <div
                  key={port.id}
                  className={cn(
                    "relative p-4 border transition-all",
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

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className={cn(
                        "text-lg font-mono font-medium",
                        isDark ? "text-zinc-100" : "text-zinc-800"
                      )}>
                        {port.port}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          "text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 border",
                          isDark ? "border-zinc-600 text-zinc-400" : "border-zinc-400 text-zinc-600"
                        )}>
                          {port.protocol}
                        </span>
                        {port.primary && (
                          <span className={cn(
                            "text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 border",
                            isDark ? "border-green-500/50 text-green-400" : "border-green-400 text-green-600"
                          )}>
                            Primary
                          </span>
                        )}
                      </div>
                      <span className={cn(
                        "text-sm",
                        isDark ? "text-zinc-500" : "text-zinc-500"
                      )}>
                        {port.description}
                      </span>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={port.primary}
                      className={cn(
                        "transition-all p-2",
                        isDark
                          ? "border-red-900/60 text-red-400/80 hover:text-red-300 hover:border-red-700 disabled:opacity-30"
                          : "border-red-300 text-red-600 hover:text-red-700 hover:border-red-400 disabled:opacity-30"
                      )}
                    >
                      <BsTrash className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Subdomains Section */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <BsGlobe className={cn("w-5 h-5", isDark ? "text-zinc-400" : "text-zinc-600")} />
                <h2 className={cn(
                  "text-sm font-medium uppercase tracking-wider",
                  isDark ? "text-zinc-300" : "text-zinc-700"
                )}>
                  Subdomains
                </h2>
              </div>
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
                <BsPlus className="w-4 h-4" />
                <span className="text-xs uppercase tracking-wider">Add Subdomain</span>
              </Button>
            </div>

            <div className="space-y-3">
              {mockSubdomains.map((sub) => (
                <div
                  key={sub.id}
                  className={cn(
                    "relative p-4 border transition-all",
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

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className={cn(
                        "text-sm font-mono",
                        isDark ? "text-zinc-100" : "text-zinc-800"
                      )}>
                        {sub.subdomain}.{sub.domain}
                      </div>
                      <div className="flex items-center gap-2">
                        {sub.ssl && (
                          <span className={cn(
                            "text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 border",
                            isDark ? "border-green-500/50 text-green-400" : "border-green-400 text-green-600"
                          )}>
                            SSL
                          </span>
                        )}
                      </div>
                      <span className={cn(
                        "text-sm",
                        isDark ? "text-zinc-500" : "text-zinc-500"
                      )}>
                        → Port {sub.targetPort}
                      </span>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className={cn(
                        "transition-all p-2",
                        isDark
                          ? "border-red-900/60 text-red-400/80 hover:text-red-300 hover:border-red-700"
                          : "border-red-300 text-red-600 hover:text-red-700 hover:border-red-400"
                      )}
                    >
                      <BsTrash className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NetworkPage;
