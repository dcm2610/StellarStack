"use client";

import { useState, useEffect, type JSX } from "react";
import { useRouter } from "next/navigation";
import { useTheme as useNextTheme } from "next-themes";
import { cn } from "@workspace/ui/lib/utils";
import { Button } from "@workspace/ui/components/button";
import { AnimatedBackground } from "@workspace/ui/components/shared/AnimatedBackground";
import { FloatingDots } from "@workspace/ui/components/shared/Animations";
import { BsSun, BsMoon, BsServer, BsChevronRight, BsBoxArrowRight } from "react-icons/bs";
import { servers as serversApi } from "@/lib/api";
import type { Server } from "@/lib/api";
import { useAuth } from "@/components/auth-provider";
import { toast } from "sonner";

type ServerStatus = "INSTALLING" | "STARTING" | "RUNNING" | "STOPPING" | "STOPPED" | "ERROR";

const ServersPage = (): JSX.Element | null => {
  const router = useRouter();
  const { setTheme, resolvedTheme } = useNextTheme();
  const { signOut, isAdmin } = useAuth();
  const [mounted, setMounted] = useState(false);
  const [servers, setServers] = useState<Server[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const fetchServers = async () => {
      try {
        const data = await serversApi.list();
        setServers(data);
      } catch (error) {
        toast.error("Failed to fetch servers");
      } finally {
        setIsLoading(false);
      }
    };

    fetchServers();
  }, []);

  const isDark = mounted ? resolvedTheme === "dark" : true;

  const handleServerSelect = (serverId: string) => {
    router.push(`/servers/${serverId}/overview`);
  };

  const handleSignOut = async () => {
    await signOut();
    router.push("/");
  };

  if (!mounted) return null;

  const getStatusColor = (status: ServerStatus) => {
    switch (status) {
      case "RUNNING":
        return "text-green-500 border-green-500";
      case "STOPPED":
        return "text-zinc-500 border-zinc-500";
      case "STARTING":
      case "STOPPING":
        return "text-amber-500 border-amber-500";
      case "INSTALLING":
        return "text-blue-500 border-blue-500";
      case "ERROR":
        return "text-red-500 border-red-500";
      default:
        return "text-zinc-500 border-zinc-500";
    }
  };

  const getLocationString = (server: Server) => {
    if (server.node?.location) {
      const loc = server.node.location;
      const parts = [loc.city, loc.country].filter(Boolean);
      return parts.length > 0 ? parts.join(", ") : server.node.displayName;
    }
    return server.node?.displayName || "Unknown";
  };

  const getGameType = (server: Server) => {
    return server.blueprint?.name || "Unknown";
  };

  return (
    <div className={cn(
      "min-h-svh transition-colors relative",
      isDark ? "bg-[#0b0b0a]" : "bg-[#f5f5f4]"
    )}>
      <AnimatedBackground isDark={isDark} />
      <FloatingDots isDark={isDark} count={15} />

      {/* Header */}
      <div className="relative p-8">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className={cn(
                "text-2xl font-light tracking-wider",
                isDark ? "text-zinc-100" : "text-zinc-800"
              )}>
                YOUR SERVERS
              </h1>
              <p className={cn(
                "text-sm mt-1",
                isDark ? "text-zinc-500" : "text-zinc-500"
              )}>
                Select a server to manage
              </p>
            </div>
            <div className="flex items-center gap-2">
              {isAdmin && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => router.push("/admin")}
                  className={cn(
                    "transition-all hover:scale-[1.02] active:scale-95 gap-2",
                    isDark
                      ? "border-amber-700 text-amber-400 hover:text-amber-300 hover:border-amber-500"
                      : "border-amber-300 text-amber-600 hover:text-amber-700 hover:border-amber-400"
                  )}
                >
                  <span className="text-xs uppercase tracking-wider">Admin</span>
                </Button>
              )}
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
              <Button
                variant="outline"
                size="sm"
                onClick={handleSignOut}
                className={cn(
                  "transition-all hover:scale-[1.02] active:scale-95 gap-2",
                  isDark
                    ? "border-zinc-700 text-zinc-400 hover:text-zinc-100 hover:border-zinc-500"
                    : "border-zinc-300 text-zinc-600 hover:text-zinc-900 hover:border-zinc-400"
                )}
              >
                <BsBoxArrowRight className="w-4 h-4" />
                <span className="text-xs uppercase tracking-wider">Sign Out</span>
              </Button>
            </div>
          </div>

          {/* Server List */}
          <div className="space-y-4">
            {isLoading ? (
              <div className={cn(
                "text-center py-12 text-sm",
                isDark ? "text-zinc-500" : "text-zinc-400"
              )}>
                Loading servers...
              </div>
            ) : servers.length === 0 ? (
              <div className={cn(
                "text-center py-12 border",
                isDark ? "border-zinc-800 text-zinc-500" : "border-zinc-200 text-zinc-400"
              )}>
                No servers found. Contact an administrator to create one.
              </div>
            ) : (
              servers.map((server) => (
                <button
                  key={server.id}
                  onClick={() => handleServerSelect(server.id)}
                  className={cn(
                    "relative w-full p-6 border text-left transition-all hover:scale-[1.01] group cursor-pointer",
                    isDark
                      ? "bg-gradient-to-b from-[#141414] via-[#0f0f0f] to-[#0a0a0a] border-zinc-200/10 shadow-lg shadow-black/20 hover:border-zinc-700"
                      : "bg-gradient-to-b from-white via-zinc-50 to-zinc-100 border-zinc-300 shadow-lg shadow-zinc-400/20 hover:border-zinc-400"
                  )}
                >
                  {/* Corner decorations */}
                  <div className={cn(
                    "absolute top-0 left-0 w-3 h-3 border-t border-l",
                    isDark ? "border-zinc-500" : "border-zinc-400"
                  )} />
                  <div className={cn(
                    "absolute top-0 right-0 w-3 h-3 border-t border-r",
                    isDark ? "border-zinc-500" : "border-zinc-400"
                  )} />
                  <div className={cn(
                    "absolute bottom-0 left-0 w-3 h-3 border-b border-l",
                    isDark ? "border-zinc-500" : "border-zinc-400"
                  )} />
                  <div className={cn(
                    "absolute bottom-0 right-0 w-3 h-3 border-b border-r",
                    isDark ? "border-zinc-500" : "border-zinc-400"
                  )} />

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className={cn(
                        "p-3 border",
                        isDark ? "border-zinc-700 bg-zinc-800/50" : "border-zinc-300 bg-zinc-100"
                      )}>
                        <BsServer className={cn(
                          "w-6 h-6",
                          isDark ? "text-zinc-400" : "text-zinc-600"
                        )} />
                      </div>
                      <div>
                        <div className="flex items-center gap-3">
                          <h2 className={cn(
                            "text-sm font-medium uppercase tracking-wider",
                            isDark ? "text-zinc-100" : "text-zinc-800"
                          )}>
                            {server.name}
                          </h2>
                          <span className={cn(
                            "text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 border",
                            getStatusColor(server.status)
                          )}>
                            {server.status}
                          </span>
                        </div>
                        <div className={cn(
                          "flex items-center gap-4 mt-1 text-xs",
                          isDark ? "text-zinc-500" : "text-zinc-500"
                        )}>
                          <span>{getGameType(server)}</span>
                          <span>-</span>
                          <span>{server.memory}MB RAM</span>
                          <span>-</span>
                          <span>{getLocationString(server)}</span>
                        </div>
                        {server.description && (
                          <div className={cn(
                            "mt-2 text-xs",
                            isDark ? "text-zinc-600" : "text-zinc-400"
                          )}>
                            {server.description}
                          </div>
                        )}
                      </div>
                    </div>
                    <BsChevronRight className={cn(
                      "w-5 h-5 transition-transform group-hover:translate-x-1",
                      isDark ? "text-zinc-600 group-hover:text-zinc-400" : "text-zinc-400 group-hover:text-zinc-600"
                    )} />
                  </div>
                </button>
              ))
            )}
          </div>

          {/* Admin-only: Add Server Button */}
          {isAdmin && (
            <button
              onClick={() => router.push("/admin/servers")}
              className={cn(
                "relative w-full mt-4 p-6 border border-dashed text-center transition-all hover:scale-[1.01] cursor-pointer",
                isDark
                  ? "border-zinc-700 hover:border-zinc-500 text-zinc-500 hover:text-zinc-300"
                  : "border-zinc-300 hover:border-zinc-400 text-zinc-400 hover:text-zinc-600"
              )}
            >
              <span className="text-sm font-medium uppercase tracking-wider">+ Create New Server</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ServersPage;
