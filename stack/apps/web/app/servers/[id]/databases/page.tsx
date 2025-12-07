"use client";

import { useState, useEffect, type JSX } from "react";
import { useParams } from "next/navigation";
import { useTheme as useNextTheme } from "next-themes";
import { cn } from "@workspace/ui/lib/utils";
import { Button } from "@workspace/ui/components/button";
import { AnimatedBackground } from "@workspace/ui/components/shared/AnimatedBackground";
import { FloatingDots } from "@workspace/ui/components/shared/Animations";
import { SidebarTrigger } from "@workspace/ui/components/sidebar";
import { BsSun, BsMoon, BsPlus, BsTrash, BsEye, BsEyeSlash, BsClipboard } from "react-icons/bs";

interface Database {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  password: string;
  size: string;
  connections: number;
  maxConnections: number;
}

const mockDatabases: Database[] = [
  { id: "db-1", name: "minecraft_data", host: "localhost", port: 3306, username: "mc_user", password: "••••••••", size: "256 MB", connections: 5, maxConnections: 50 },
  { id: "db-2", name: "player_stats", host: "localhost", port: 3306, username: "stats_user", password: "••••••••", size: "128 MB", connections: 2, maxConnections: 25 },
];

const DatabasesPage = (): JSX.Element | null => {
  const params = useParams();
  const serverId = params.id as string;
  const { setTheme, resolvedTheme } = useNextTheme();
  const [mounted, setMounted] = useState(false);
  const [visiblePasswords, setVisiblePasswords] = useState<string[]>([]);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = mounted ? resolvedTheme === "dark" : true;

  if (!mounted) return null;

  const togglePassword = (id: string) => {
    setVisiblePasswords(prev =>
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    );
  };

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
                  DATABASES
                </h1>
                <p className={cn(
                  "text-sm mt-1",
                  isDark ? "text-zinc-500" : "text-zinc-500"
                )}>
                  Server {serverId} • {mockDatabases.length} databases
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
                <BsPlus className="w-4 h-4" />
                <span className="text-xs uppercase tracking-wider">New Database</span>
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

          {/* Database List */}
          <div className="space-y-4">
            {mockDatabases.map((db) => (
              <div
                key={db.id}
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

                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-4">
                      <h3 className={cn(
                        "text-sm font-medium uppercase tracking-wider",
                        isDark ? "text-zinc-100" : "text-zinc-800"
                      )}>
                        {db.name}
                      </h3>
                      <span className={cn(
                        "text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 border",
                        isDark ? "border-green-500/50 text-green-400" : "border-green-400 text-green-600"
                      )}>
                        {db.connections}/{db.maxConnections} connections
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className={cn(
                          "text-[10px] font-medium uppercase tracking-wider",
                          isDark ? "text-zinc-500" : "text-zinc-400"
                        )}>
                          Host
                        </label>
                        <div className={cn(
                          "mt-1 text-sm font-mono",
                          isDark ? "text-zinc-300" : "text-zinc-700"
                        )}>
                          {db.host}:{db.port}
                        </div>
                      </div>
                      <div>
                        <label className={cn(
                          "text-[10px] font-medium uppercase tracking-wider",
                          isDark ? "text-zinc-500" : "text-zinc-400"
                        )}>
                          Size
                        </label>
                        <div className={cn(
                          "mt-1 text-sm",
                          isDark ? "text-zinc-300" : "text-zinc-700"
                        )}>
                          {db.size}
                        </div>
                      </div>
                      <div>
                        <label className={cn(
                          "text-[10px] font-medium uppercase tracking-wider",
                          isDark ? "text-zinc-500" : "text-zinc-400"
                        )}>
                          Username
                        </label>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={cn(
                            "text-sm font-mono",
                            isDark ? "text-zinc-300" : "text-zinc-700"
                          )}>
                            {db.username}
                          </span>
                          <button className={cn(
                            "p-1 transition-colors",
                            isDark ? "text-zinc-500 hover:text-zinc-300" : "text-zinc-400 hover:text-zinc-600"
                          )}>
                            <BsClipboard className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                      <div>
                        <label className={cn(
                          "text-[10px] font-medium uppercase tracking-wider",
                          isDark ? "text-zinc-500" : "text-zinc-400"
                        )}>
                          Password
                        </label>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={cn(
                            "text-sm font-mono",
                            isDark ? "text-zinc-300" : "text-zinc-700"
                          )}>
                            {visiblePasswords.includes(db.id) ? "SecretPass123!" : "••••••••"}
                          </span>
                          <button
                            onClick={() => togglePassword(db.id)}
                            className={cn(
                              "p-1 transition-colors",
                              isDark ? "text-zinc-500 hover:text-zinc-300" : "text-zinc-400 hover:text-zinc-600"
                            )}
                          >
                            {visiblePasswords.includes(db.id) ? (
                              <BsEyeSlash className="w-3 h-3" />
                            ) : (
                              <BsEye className="w-3 h-3" />
                            )}
                          </button>
                          <button className={cn(
                            "p-1 transition-colors",
                            isDark ? "text-zinc-500 hover:text-zinc-300" : "text-zinc-400 hover:text-zinc-600"
                          )}>
                            <BsClipboard className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>
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
  );
};

export default DatabasesPage;
