"use client";

import { useState } from "react";
import { usePathname, useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
} from "@workspace/ui/components/sidebar";
import {
  ServerIcon,
  LayoutDashboardIcon,
  SettingsIcon,
  UsersIcon,
  FolderIcon,
  DatabaseIcon,
  ActivityIcon,
  NetworkIcon,
  ArchiveIcon,
  CalendarIcon,
  PlayIcon,
  ArrowLeftIcon,
  UserIcon,
  LogOutIcon,
  BellIcon,
  ChevronUpIcon,
  ShieldIcon,
  WebhookIcon,
  SplitIcon,
} from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";
import { useAuth } from "@/components/auth-provider";
import { WaveText } from "@/components/wave-text";
import { useServer } from "@/components/server-provider";
import { useServerWebSocket } from "@/hooks/useServerWebSocket";
import { CpuIcon, HardDriveIcon, MemoryStickIcon } from "lucide-react";

// Navigation items - href will be prefixed with /servers/[id]
const navItems = [
  { title: "Overview", icon: LayoutDashboardIcon, href: "/overview" },
  { title: "Files", icon: FolderIcon, href: "/files" },
  { title: "Backups", icon: ArchiveIcon, href: "/backups" },
  { title: "Schedules", icon: CalendarIcon, href: "/schedules" },
  { title: "Users", icon: UsersIcon, href: "/users" },
  { title: "Databases", icon: DatabaseIcon, href: "/databases" },
  { title: "Network", icon: NetworkIcon, href: "/network" },
  { title: "Webhooks", icon: WebhookIcon, href: "/webhooks" },
  { title: "Split", icon: SplitIcon, href: "/split" },
  { title: "Activity", icon: ActivityIcon, href: "/activity" },
  { title: "Startup", icon: PlayIcon, href: "/startup" },
  { title: "Settings", icon: SettingsIcon, href: "/settings" },
];

export const AppSidebar = () => {
  const pathname = usePathname();
  const params = useParams();
  const router = useRouter();
  const serverId = params.id as string;
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const { user: authUser, signOut, isAdmin } = useAuth();
  const { server, consoleInfo } = useServer();

  // Get real-time stats from WebSocket
  const { stats: statsData } = useServerWebSocket({
    consoleInfo,
    enabled: !!consoleInfo,
  });

  // Calculate stats percentages (similar to overview page)
  const stats = statsData.current;
  const cpuPercent = stats?.cpu_absolute ?? 0;
  const cpuLimit = server?.cpu ?? 100;

  const memUsed = stats?.memory_bytes ? stats.memory_bytes / (1024 * 1024 * 1024) : 0;
  const memLimit = server?.memory ? server.memory / 1024 : 1;
  const memPercent = memLimit > 0 ? (memUsed / memLimit) * 100 : 0;

  const diskUsed = stats?.disk_bytes ? stats.disk_bytes / (1024 * 1024 * 1024) : 0;
  const diskLimit = server?.disk ? server.disk / 1024 : 10;
  const diskPercent = diskLimit > 0 ? (diskUsed / diskLimit) * 100 : 0;

  // Helper to get color based on usage percentage
  const getUsageColor = (percent: number) => {
    if (percent >= 85) return "text-red-400";
    if (percent >= 70) return "text-amber-400";
    return "text-emerald-400";
  };

  // User data from auth
  const user = authUser
    ? {
        name: authUser.name || "User",
        email: authUser.email,
        initials: (authUser.name || "U").slice(0, 2).toUpperCase(),
      }
    : {
        name: "Guest",
        email: "",
        initials: "G",
      };

  // User menu items - dynamic based on role
  const userMenuItems = [
    { title: "Account Settings", icon: UserIcon, href: "/account" },
    { title: "Notifications", icon: BellIcon, href: "/account/notifications" },
    ...(isAdmin ? [{ title: "Admin Panel", icon: ShieldIcon, href: "/admin" }] : []),
  ];

  const getFullHref = (href: string) => `/servers/${serverId}${href}`;

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <Sidebar
      className={cn(
        "border-r shadow-lg",
        "border-zinc-200/10 bg-gradient-to-b from-[#141414] via-[#0f0f0f] to-[#0a0a0a] shadow-black/20"
      )}
    >
      <SidebarHeader
        className={cn("border-b p-4", "border-zinc-200/10")}
      >
        {/* Back to Servers */}
        <Link
          href="/servers"
          className={cn(
            "group relative flex w-full items-center gap-2 border px-3 py-2 text-left transition-colors",
            "border-zinc-700/50 bg-zinc-900/50 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
          )}
        >
          <ArrowLeftIcon
            className={cn(
              "h-4 w-4 shrink-0 transition-transform group-hover:-translate-x-0.5",
              "text-zinc-500"
            )}
          />
          <span className="text-xs font-medium tracking-wider uppercase">All Servers</span>

          {/* Corner accents */}
          <div
            className={cn(
              "pointer-events-none absolute top-0 left-0 h-1.5 w-1.5 border-t border-l",
              "border-zinc-600"
            )}
          />
          <div
            className={cn(
              "pointer-events-none absolute top-0 right-0 h-1.5 w-1.5 border-t border-r",
              "border-zinc-600"
            )}
          />
          <div
            className={cn(
              "pointer-events-none absolute bottom-0 left-0 h-1.5 w-1.5 border-b border-l",
              "border-zinc-600"
            )}
          />
          <div
            className={cn(
              "pointer-events-none absolute right-0 bottom-0 h-1.5 w-1.5 border-r border-b",
              "border-zinc-600"
            )}
          />
        </Link>

        {/* Current Server Display */}
        <div
          className={cn(
            "mt-3 flex items-center gap-2 px-3 py-2",
            "text-zinc-300"
          )}
        >
          <ServerIcon
            className={cn("h-4 w-4 shrink-0", "text-zinc-500")}
          />
          <span className="truncate text-xs font-medium tracking-wider uppercase">
            Server {serverId}
          </span>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2">
        <SidebarGroup>
          <SidebarGroupLabel
            className={cn(
              "px-2 text-[10px] font-medium tracking-wider uppercase",
              "text-zinc-600"
            )}
          >
            Manage
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                const fullHref = getFullHref(item.href);
                const isActive = pathname === fullHref || pathname.startsWith(fullHref + "/");
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      className={cn(
                        "rounded-none text-xs transition-colors",
                        "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-100 data-[active=true]:bg-zinc-800/80 data-[active=true]:text-zinc-100"
                      )}
                    >
                      <Link href={fullHref}>
                        <item.icon className="h-4 w-4" />
                        <span
                          className={
                            isActive
                              ? "uppercase opacity-100 hover:opacity-100"
                              : "uppercase opacity-50 hover:opacity-100"
                          }
                        >
                          {item.title}
                        </span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter
        className={cn("border-t p-4", "border-zinc-200/10")}
      >
        {/* Server Stats */}
        <div
          className={cn(
            "mb-3 space-y-2 border px-3 py-2",
            "border-zinc-700/50 bg-zinc-900/50"
          )}
        >
          {/* CPU */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <CpuIcon
                className={cn("h-3.5 w-3.5 shrink-0", "text-zinc-500")}
              />
              <span
                className={cn(
                  "text-[10px] font-medium tracking-wider uppercase",
                  "text-zinc-400"
                )}
              >
                CPU
              </span>
            </div>
            <span className={cn("text-[10px] font-medium tabular-nums", getUsageColor(cpuPercent))}>
              {cpuPercent.toFixed(0)}%
            </span>
          </div>

          {/* Memory */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <MemoryStickIcon
                className={cn("h-3.5 w-3.5 shrink-0", "text-zinc-500")}
              />
              <span
                className={cn(
                  "text-[10px] font-medium tracking-wider uppercase",
                  "text-zinc-400"
                )}
              >
                RAM
              </span>
            </div>
            <span className={cn("text-[10px] font-medium tabular-nums", getUsageColor(memPercent))}>
              {memUsed.toFixed(1)} / {memLimit.toFixed(0)} GB
            </span>
          </div>

          {/* Disk */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <HardDriveIcon
                className={cn("h-3.5 w-3.5 shrink-0", "text-zinc-500")}
              />
              <span
                className={cn(
                  "text-[10px] font-medium tracking-wider uppercase",
                  "text-zinc-400"
                )}
              >
                Disk
              </span>
            </div>
            <span
              className={cn("text-[10px] font-medium tabular-nums", getUsageColor(diskPercent))}
            >
              {diskUsed.toFixed(1)} / {diskLimit.toFixed(0)} GB
            </span>
          </div>
        </div>

        {/* User Menu */}
        <div className="relative">
          <button
            onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
            className={cn(
              "group relative flex w-full items-center gap-3 border px-3 py-2 text-left transition-colors",
              "border-zinc-700/50 bg-zinc-900/50 hover:border-zinc-500"
            )}
          >
            {/* Avatar */}
            <div
              className={cn(
                "flex h-8 w-8 items-center justify-center text-xs font-medium uppercase",
                "border border-zinc-700 bg-zinc-800 text-zinc-300"
              )}
            >
              {user.initials}
            </div>
            <div className="min-w-0 flex-1">
              <div
                className={cn(
                  "truncate text-xs font-medium",
                  "text-zinc-200"
                )}
              >
                {user.name}
              </div>
              <div
                className={cn("truncate text-[10px]", "text-zinc-500")}
              >
                {user.email}
              </div>
            </div>
            <ChevronUpIcon
              className={cn(
                "h-4 w-4 shrink-0 transition-transform",
                "text-zinc-500",
                isUserMenuOpen && "rotate-180"
              )}
            />

            {/* Corner accents */}
            <div
              className={cn(
                "pointer-events-none absolute top-0 left-0 h-1.5 w-1.5 border-t border-l",
                "border-zinc-600"
              )}
            />
            <div
              className={cn(
                "pointer-events-none absolute top-0 right-0 h-1.5 w-1.5 border-t border-r",
                "border-zinc-600"
              )}
            />
            <div
              className={cn(
                "pointer-events-none absolute bottom-0 left-0 h-1.5 w-1.5 border-b border-l",
                "border-zinc-600"
              )}
            />
            <div
              className={cn(
                "pointer-events-none absolute right-0 bottom-0 h-1.5 w-1.5 border-r border-b",
                "border-zinc-600"
              )}
            />
          </button>

          {/* User Dropdown Menu */}
          {isUserMenuOpen && (
            <div
              className={cn(
                "absolute right-0 bottom-full left-0 z-50 mb-1 border shadow-lg",
                "border-zinc-700/50 bg-[#0f0f0f] shadow-black/40"
              )}
            >
              {/* Corner accents on dropdown */}
              <div
                className={cn(
                  "pointer-events-none absolute top-0 left-0 h-1.5 w-1.5 border-t border-l",
                  "border-zinc-500"
                )}
              />
              <div
                className={cn(
                  "pointer-events-none absolute top-0 right-0 h-1.5 w-1.5 border-t border-r",
                  "border-zinc-500"
                )}
              />
              <div
                className={cn(
                  "pointer-events-none absolute bottom-0 left-0 h-1.5 w-1.5 border-b border-l",
                  "border-zinc-500"
                )}
              />
              <div
                className={cn(
                  "pointer-events-none absolute right-0 bottom-0 h-1.5 w-1.5 border-r border-b",
                  "border-zinc-500"
                )}
              />

              {userMenuItems.map((item) => (
                <Link
                  key={item.title}
                  href={item.href}
                  onClick={() => setIsUserMenuOpen(false)}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 text-xs transition-colors",
                    "text-zinc-300 hover:bg-zinc-800"
                  )}
                >
                  <item.icon
                    className={cn("h-4 w-4", "text-zinc-500")}
                  />
                  <span className="tracking-wider uppercase">{item.title}</span>
                </Link>
              ))}

              {/* Divider */}
              <div
                className={cn("my-1 border-t", "border-zinc-700/50")}
              />

              {/* Sign Out */}
              <button
                onClick={() => {
                  setIsUserMenuOpen(false);
                  handleSignOut();
                }}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors",
                  "text-red-400/80 hover:bg-zinc-800"
                )}
              >
                <LogOutIcon className="h-4 w-4" />
                <span className="tracking-wider uppercase">Sign Out</span>
              </button>
            </div>
          )}
        </div>

        {/* Version */}
        <div
          className={cn(
            "mt-3 text-center text-[10px] tracking-wider uppercase",
            "text-zinc-600"
          )}
        >
          <WaveText
            text={`StellarStack v${process.env.NEXT_PUBLIC_GIT_COMMIT_HASH?.slice(0, 7) || "dev"}-alpha`}
            baseClassName="text-zinc-600"
            highlightClassName="text-zinc-100"
          />
        </div>
      </SidebarFooter>
    </Sidebar>
  );
};
