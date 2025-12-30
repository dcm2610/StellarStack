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
  TerminalIcon,
} from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";
import { useAuth } from "@/components/auth-provider";
import { WaveText } from "@/components/wave-text";

// Navigation items - href will be prefixed with /servers/[id]
const navItems = [
  { title: "Overview", icon: LayoutDashboardIcon, href: "/overview" },
  { title: "Console", icon: TerminalIcon, href: "/console" },
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

interface AppSidebarProps {
  isDark?: boolean;
}

export const AppSidebar = ({ isDark = true }: AppSidebarProps) => {
  const pathname = usePathname();
  const params = useParams();
  const router = useRouter();
  const serverId = params.id as string;
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const { user: authUser, signOut, isAdmin } = useAuth();

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
        isDark
          ? "border-zinc-200/10 bg-gradient-to-b from-[#141414] via-[#0f0f0f] to-[#0a0a0a] shadow-black/20"
          : "border-zinc-300 bg-gradient-to-b from-white via-zinc-50 to-zinc-100 shadow-zinc-400/20"
      )}
    >
      <SidebarHeader
        className={cn("border-b p-4", isDark ? "border-zinc-200/10" : "border-zinc-300")}
      >
        {/* Back to Servers */}
        <Link
          href="/servers"
          className={cn(
            "group relative flex w-full items-center gap-2 border px-3 py-2 text-left transition-colors",
            isDark
              ? "border-zinc-700/50 bg-zinc-900/50 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
              : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-400 hover:text-zinc-800"
          )}
        >
          <ArrowLeftIcon
            className={cn(
              "h-4 w-4 shrink-0 transition-transform group-hover:-translate-x-0.5",
              isDark ? "text-zinc-500" : "text-zinc-400"
            )}
          />
          <span className="text-xs font-medium tracking-wider uppercase">All Servers</span>

          {/* Corner accents */}
          <div
            className={cn(
              "pointer-events-none absolute top-0 left-0 h-1.5 w-1.5 border-t border-l",
              isDark ? "border-zinc-600" : "border-zinc-300"
            )}
          />
          <div
            className={cn(
              "pointer-events-none absolute top-0 right-0 h-1.5 w-1.5 border-t border-r",
              isDark ? "border-zinc-600" : "border-zinc-300"
            )}
          />
          <div
            className={cn(
              "pointer-events-none absolute bottom-0 left-0 h-1.5 w-1.5 border-b border-l",
              isDark ? "border-zinc-600" : "border-zinc-300"
            )}
          />
          <div
            className={cn(
              "pointer-events-none absolute right-0 bottom-0 h-1.5 w-1.5 border-r border-b",
              isDark ? "border-zinc-600" : "border-zinc-300"
            )}
          />
        </Link>

        {/* Current Server Display */}
        <div
          className={cn(
            "mt-3 flex items-center gap-2 px-3 py-2",
            isDark ? "text-zinc-300" : "text-zinc-700"
          )}
        >
          <ServerIcon
            className={cn("h-4 w-4 shrink-0", isDark ? "text-zinc-500" : "text-zinc-400")}
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
              isDark ? "text-zinc-600" : "text-zinc-400"
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
                        isDark
                          ? "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-100 data-[active=true]:bg-zinc-800/80 data-[active=true]:text-zinc-100"
                          : "text-zinc-600 hover:bg-zinc-200/50 hover:text-zinc-900 data-[active=true]:bg-zinc-200/80 data-[active=true]:text-zinc-900"
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
        className={cn("border-t p-4", isDark ? "border-zinc-200/10" : "border-zinc-300")}
      >
        {/* User Menu */}
        <div className="relative">
          <button
            onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
            className={cn(
              "group relative flex w-full items-center gap-3 border px-3 py-2 text-left transition-colors",
              isDark
                ? "border-zinc-700/50 bg-zinc-900/50 hover:border-zinc-500"
                : "border-zinc-200 bg-white hover:border-zinc-400"
            )}
          >
            {/* Avatar */}
            <div
              className={cn(
                "flex h-8 w-8 items-center justify-center text-xs font-medium uppercase",
                isDark
                  ? "border border-zinc-700 bg-zinc-800 text-zinc-300"
                  : "border border-zinc-300 bg-zinc-200 text-zinc-700"
              )}
            >
              {user.initials}
            </div>
            <div className="min-w-0 flex-1">
              <div
                className={cn(
                  "truncate text-xs font-medium",
                  isDark ? "text-zinc-200" : "text-zinc-800"
                )}
              >
                {user.name}
              </div>
              <div
                className={cn("truncate text-[10px]", isDark ? "text-zinc-500" : "text-zinc-500")}
              >
                {user.email}
              </div>
            </div>
            <ChevronUpIcon
              className={cn(
                "h-4 w-4 shrink-0 transition-transform",
                isDark ? "text-zinc-500" : "text-zinc-400",
                isUserMenuOpen && "rotate-180"
              )}
            />

            {/* Corner accents */}
            <div
              className={cn(
                "pointer-events-none absolute top-0 left-0 h-1.5 w-1.5 border-t border-l",
                isDark ? "border-zinc-600" : "border-zinc-300"
              )}
            />
            <div
              className={cn(
                "pointer-events-none absolute top-0 right-0 h-1.5 w-1.5 border-t border-r",
                isDark ? "border-zinc-600" : "border-zinc-300"
              )}
            />
            <div
              className={cn(
                "pointer-events-none absolute bottom-0 left-0 h-1.5 w-1.5 border-b border-l",
                isDark ? "border-zinc-600" : "border-zinc-300"
              )}
            />
            <div
              className={cn(
                "pointer-events-none absolute right-0 bottom-0 h-1.5 w-1.5 border-r border-b",
                isDark ? "border-zinc-600" : "border-zinc-300"
              )}
            />
          </button>

          {/* User Dropdown Menu */}
          {isUserMenuOpen && (
            <div
              className={cn(
                "absolute right-0 bottom-full left-0 z-50 mb-1 border shadow-lg",
                isDark
                  ? "border-zinc-700/50 bg-[#0f0f0f] shadow-black/40"
                  : "border-zinc-200 bg-white shadow-zinc-200/40"
              )}
            >
              {/* Corner accents on dropdown */}
              <div
                className={cn(
                  "pointer-events-none absolute top-0 left-0 h-1.5 w-1.5 border-t border-l",
                  isDark ? "border-zinc-500" : "border-zinc-400"
                )}
              />
              <div
                className={cn(
                  "pointer-events-none absolute top-0 right-0 h-1.5 w-1.5 border-t border-r",
                  isDark ? "border-zinc-500" : "border-zinc-400"
                )}
              />
              <div
                className={cn(
                  "pointer-events-none absolute bottom-0 left-0 h-1.5 w-1.5 border-b border-l",
                  isDark ? "border-zinc-500" : "border-zinc-400"
                )}
              />
              <div
                className={cn(
                  "pointer-events-none absolute right-0 bottom-0 h-1.5 w-1.5 border-r border-b",
                  isDark ? "border-zinc-500" : "border-zinc-400"
                )}
              />

              {userMenuItems.map((item) => (
                <Link
                  key={item.title}
                  href={item.href}
                  onClick={() => setIsUserMenuOpen(false)}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 text-xs transition-colors",
                    isDark ? "text-zinc-300 hover:bg-zinc-800" : "text-zinc-700 hover:bg-zinc-100"
                  )}
                >
                  <item.icon
                    className={cn("h-4 w-4", isDark ? "text-zinc-500" : "text-zinc-400")}
                  />
                  <span className="tracking-wider uppercase">{item.title}</span>
                </Link>
              ))}

              {/* Divider */}
              <div
                className={cn("my-1 border-t", isDark ? "border-zinc-700/50" : "border-zinc-200")}
              />

              {/* Sign Out */}
              <button
                onClick={() => {
                  setIsUserMenuOpen(false);
                  handleSignOut();
                }}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors",
                  isDark ? "text-red-400/80 hover:bg-zinc-800" : "text-red-600 hover:bg-zinc-100"
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
            isDark ? "text-zinc-600" : "text-zinc-400"
          )}
        >
          <WaveText
            text={`StellarStack v${process.env.NEXT_PUBLIC_GIT_COMMIT_HASH?.slice(0, 7) || "dev"}-alpha`}
            baseClassName={isDark ? "text-zinc-600" : "text-zinc-400"}
            highlightClassName={isDark ? "text-zinc-100" : "text-zinc-800"}
          />
        </div>
      </SidebarFooter>
    </Sidebar>
  );
};
