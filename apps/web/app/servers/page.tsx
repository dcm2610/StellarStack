"use client";

import { useState, useEffect, type JSX } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@workspace/ui/lib/utils";
import { Button } from "@workspace/ui/components/button";
import { AnimatedBackground } from "@workspace/ui/components/animated-background";
import { FloatingDots } from "@workspace/ui/components/floating-particles";
import { BsServer, BsChevronRight, BsBoxArrowRight } from "react-icons/bs";
import { servers as serversApi } from "@/lib/api";
import type { Server } from "@/lib/api";
import { useAuth } from "@/components/auth-provider";
import { toast } from "sonner";

type ServerStatus =
  | "INSTALLING"
  | "STARTING"
  | "RUNNING"
  | "STOPPING"
  | "STOPPED"
  | "SUSPENDED"
  | "MAINTENANCE"
  | "RESTORING"
  | "ERROR";

const ServersPage = (): JSX.Element | null => {
  const router = useRouter();
  const { signOut, isAdmin } = useAuth();
  const [servers, setServers] = useState<Server[]>([]);
  const [isLoading, setIsLoading] = useState(true);

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

  const handleServerSelect = (serverId: string) => {
    router.push(`/servers/${serverId}/overview`);
  };

  const handleSignOut = async () => {
    await signOut();
    router.push("/");
  };

  const getStatusColor = (status: ServerStatus) => {
    switch (status) {
      case "RUNNING":
        return "text-green-500 border-green-500";
      case "STOPPED":
        return "text-zinc-500 border-zinc-500";
      case "STARTING":
      case "STOPPING":
      case "MAINTENANCE":
        return "text-amber-500 border-amber-500";
      case "INSTALLING":
      case "RESTORING":
        return "text-blue-500 border-blue-500";
      case "SUSPENDED":
        return "text-red-400 border-red-400";
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
    <div
      className="relative min-h-svh transition-colors bg-[#0b0b0a]"
    >
      <AnimatedBackground />
      <FloatingDots count={15} />

      {/* Header */}
      <div className="relative p-8">
        <div className="mx-auto max-w-4xl">
          <div className="mb-8 flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-light tracking-wider text-zinc-100">
                YOUR SERVERS
              </h1>
              <p className="mt-1 text-sm text-zinc-500">
                Select a server to manage
              </p>
            </div>
            <div className="flex items-center gap-2">
              {isAdmin && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => router.push("/admin")}
                  className="gap-2 transition-all hover:scale-[1.02] active:scale-95 border-amber-700 text-amber-400 hover:border-amber-500 hover:text-amber-300"
                >
                  <span className="text-xs tracking-wider uppercase">Admin</span>
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={handleSignOut}
                className="gap-2 transition-all hover:scale-[1.02] active:scale-95 border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-100"
              >
                <BsBoxArrowRight className="h-4 w-4" />
                <span className="text-xs tracking-wider uppercase">Sign Out</span>
              </Button>
            </div>
          </div>

          {/* Server List */}
          <div className="space-y-4">
            {isLoading ? (
              <div className="py-12 text-center text-sm text-zinc-500">
                Loading servers...
              </div>
            ) : servers.length === 0 ? (
              <div className="border py-12 text-center border-zinc-800 text-zinc-500">
                No servers found. Contact an administrator to create one.
              </div>
            ) : (
              servers.map((server) => (
                <button
                  key={server.id}
                  onClick={() => handleServerSelect(server.id)}
                  className="group relative w-full cursor-pointer border p-6 text-left transition-all hover:scale-[1.01] border-zinc-200/10 bg-gradient-to-b from-[#141414] via-[#0f0f0f] to-[#0a0a0a] shadow-lg shadow-black/20 hover:border-zinc-700"
                >
                  {/* Corner decorations */}
                  <div className="absolute top-0 left-0 h-3 w-3 border-t border-l border-zinc-500" />
                  <div className="absolute top-0 right-0 h-3 w-3 border-t border-r border-zinc-500" />
                  <div className="absolute bottom-0 left-0 h-3 w-3 border-b border-l border-zinc-500" />
                  <div className="absolute right-0 bottom-0 h-3 w-3 border-r border-b border-zinc-500" />

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="border p-3 border-zinc-700 bg-zinc-800/50">
                        <BsServer className="h-6 w-6 text-zinc-400" />
                      </div>
                      <div>
                        <div className="flex items-center gap-3">
                          <h2 className="text-sm font-medium tracking-wider uppercase text-zinc-100">
                            {server.name}
                          </h2>
                          <span
                            className={cn(
                              "border px-2 py-0.5 text-[10px] font-medium tracking-wider uppercase",
                              getStatusColor(server.status)
                            )}
                          >
                            {server.status}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center gap-4 text-xs text-zinc-500">
                          <span>{getGameType(server)}</span>
                          <span>-</span>
                          <span>{server.memory}MB RAM</span>
                          <span>-</span>
                          <span>{getLocationString(server)}</span>
                        </div>
                        {server.description && (
                          <div className="mt-2 text-xs text-zinc-600">
                            {server.description}
                          </div>
                        )}
                      </div>
                    </div>
                    <BsChevronRight className="h-5 w-5 transition-transform group-hover:translate-x-1 text-zinc-600 group-hover:text-zinc-400" />
                  </div>
                </button>
              ))
            )}
          </div>

          {/* Admin-only: Add Server Button */}
          {isAdmin && (
            <button
              onClick={() => router.push("/admin/servers")}
              className="relative mt-4 w-full cursor-pointer border border-dashed p-6 text-center transition-all hover:scale-[1.01] border-zinc-700 text-zinc-500 hover:border-zinc-500 hover:text-zinc-300"
            >
              <span className="text-sm font-medium tracking-wider uppercase">
                + Create New Server
              </span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ServersPage;
