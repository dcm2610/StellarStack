"use client";

import { useState, useEffect, type JSX } from "react";
import { useParams } from "next/navigation";
import { useTheme as useNextTheme } from "next-themes";
import { cn } from "@workspace/ui/lib/utils";
import { Button } from "@workspace/ui/components/button";
import { AnimatedBackground } from "@workspace/ui/components/shared/AnimatedBackground";
import { FloatingDots } from "@workspace/ui/components/shared/Animations";
import { SidebarTrigger } from "@workspace/ui/components/sidebar";
import { BsSun, BsMoon, BsPlus, BsTrash, BsPencil, BsPersonFill, BsShieldFill } from "react-icons/bs";

interface ServerUser {
  id: string;
  username: string;
  email: string;
  role: "owner" | "admin" | "moderator" | "viewer";
  addedAt: string;
  lastAccess?: string;
}

const mockUsers: ServerUser[] = [
  { id: "usr-1", username: "john_doe", email: "john@example.com", role: "owner", addedAt: "2024-01-01", lastAccess: "5 minutes ago" },
  { id: "usr-2", username: "jane_smith", email: "jane@example.com", role: "admin", addedAt: "2024-01-05", lastAccess: "2 hours ago" },
  { id: "usr-3", username: "bob_wilson", email: "bob@example.com", role: "moderator", addedAt: "2024-01-10", lastAccess: "1 day ago" },
  { id: "usr-4", username: "alice_jones", email: "alice@example.com", role: "viewer", addedAt: "2024-01-12" },
];

const UsersPage = (): JSX.Element | null => {
  const params = useParams();
  const serverId = params.id as string;
  const { setTheme, resolvedTheme } = useNextTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = mounted ? resolvedTheme === "dark" : true;

  if (!mounted) return null;

  const getRoleColor = (role: ServerUser["role"]) => {
    switch (role) {
      case "owner":
        return isDark ? "border-amber-500/50 text-amber-400" : "border-amber-400 text-amber-600";
      case "admin":
        return isDark ? "border-red-500/50 text-red-400" : "border-red-400 text-red-600";
      case "moderator":
        return isDark ? "border-blue-500/50 text-blue-400" : "border-blue-400 text-blue-600";
      default:
        return isDark ? "border-zinc-600 text-zinc-400" : "border-zinc-400 text-zinc-600";
    }
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
                  USERS
                </h1>
                <p className={cn(
                  "text-sm mt-1",
                  isDark ? "text-zinc-500" : "text-zinc-500"
                )}>
                  Server {serverId} • {mockUsers.length} users
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
                <span className="text-xs uppercase tracking-wider">Add User</span>
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

          {/* Users List */}
          <div className="space-y-4">
            {mockUsers.map((user) => (
              <div
                key={user.id}
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

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={cn(
                      "w-10 h-10 flex items-center justify-center border",
                      isDark ? "border-zinc-700 bg-zinc-800/50" : "border-zinc-300 bg-zinc-100"
                    )}>
                      {user.role === "owner" ? (
                        <BsShieldFill className={cn("w-5 h-5", isDark ? "text-amber-400" : "text-amber-600")} />
                      ) : (
                        <BsPersonFill className={cn("w-5 h-5", isDark ? "text-zinc-400" : "text-zinc-500")} />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-3">
                        <h3 className={cn(
                          "text-sm font-medium uppercase tracking-wider",
                          isDark ? "text-zinc-100" : "text-zinc-800"
                        )}>
                          {user.username}
                        </h3>
                        <span className={cn(
                          "text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 border",
                          getRoleColor(user.role)
                        )}>
                          {user.role}
                        </span>
                      </div>
                      <div className={cn(
                        "flex items-center gap-4 mt-1 text-xs",
                        isDark ? "text-zinc-500" : "text-zinc-500"
                      )}>
                        <span>{user.email}</span>
                        <span>•</span>
                        <span>Added: {user.addedAt}</span>
                        {user.lastAccess && (
                          <>
                            <span>•</span>
                            <span>Last seen: {user.lastAccess}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={user.role === "owner"}
                      className={cn(
                        "transition-all p-2",
                        isDark
                          ? "border-zinc-700 text-zinc-400 hover:text-zinc-100 hover:border-zinc-500 disabled:opacity-30"
                          : "border-zinc-300 text-zinc-600 hover:text-zinc-900 hover:border-zinc-400 disabled:opacity-30"
                      )}
                    >
                      <BsPencil className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={user.role === "owner"}
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
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default UsersPage;
