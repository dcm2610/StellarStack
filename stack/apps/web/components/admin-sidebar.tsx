"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
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
  LayoutDashboardIcon,
  ServerIcon,
  MapPinIcon,
  CpuIcon,
  PackageIcon,
  UsersIcon,
  ArrowLeftIcon,
  UserIcon,
  LogOutIcon,
  BellIcon,
  ChevronUpIcon,
  ShieldIcon,
} from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";
import { useAuth } from "./auth-provider";

// Admin navigation items
const navItems = [
  { title: "Overview", icon: LayoutDashboardIcon, href: "/admin" },
  { title: "Nodes", icon: CpuIcon, href: "/admin/nodes" },
  { title: "Locations", icon: MapPinIcon, href: "/admin/locations" },
  { title: "Servers", icon: ServerIcon, href: "/admin/servers" },
  { title: "Blueprints", icon: PackageIcon, href: "/admin/blueprints" },
  { title: "Users", icon: UsersIcon, href: "/admin/users" },
];

interface AdminSidebarProps {
  isDark?: boolean;
}

export function AdminSidebar({ isDark = true }: AdminSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const { user: authUser, signOut, isAdmin } = useAuth();

  // User data from auth
  const user = authUser ? {
    name: authUser.name || "User",
    email: authUser.email,
    initials: (authUser.name || "U").slice(0, 2).toUpperCase(),
  } : {
    name: "Guest",
    email: "",
    initials: "G",
  };

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <Sidebar
      className={cn(
        "border-r shadow-lg",
        isDark
          ? "bg-gradient-to-b from-[#141414] via-[#0f0f0f] to-[#0a0a0a] border-zinc-200/10 shadow-black/20"
          : "bg-gradient-to-b from-white via-zinc-50 to-zinc-100 border-zinc-300 shadow-zinc-400/20"
      )}
    >
      <SidebarHeader className={cn("p-4 border-b", isDark ? "border-zinc-200/10" : "border-zinc-300")}>
        {/* Back to Servers */}
        <Link
          href="/servers"
          className={cn(
            "relative w-full flex items-center gap-2 px-3 py-2 text-left transition-colors border group",
            isDark
              ? "bg-zinc-900/50 border-zinc-700/50 hover:border-zinc-500 text-zinc-400 hover:text-zinc-200"
              : "bg-white border-zinc-200 hover:border-zinc-400 text-zinc-600 hover:text-zinc-800"
          )}
        >
          <ArrowLeftIcon className={cn(
            "w-4 h-4 shrink-0 transition-transform group-hover:-translate-x-0.5",
            isDark ? "text-zinc-500" : "text-zinc-400"
          )} />
          <span className="text-xs font-medium uppercase tracking-wider">Back to Panel</span>

          {/* Corner accents */}
          <div className={cn("absolute top-0 left-0 w-1.5 h-1.5 border-t border-l pointer-events-none", isDark ? "border-zinc-600" : "border-zinc-300")} />
          <div className={cn("absolute top-0 right-0 w-1.5 h-1.5 border-t border-r pointer-events-none", isDark ? "border-zinc-600" : "border-zinc-300")} />
          <div className={cn("absolute bottom-0 left-0 w-1.5 h-1.5 border-b border-l pointer-events-none", isDark ? "border-zinc-600" : "border-zinc-300")} />
          <div className={cn("absolute bottom-0 right-0 w-1.5 h-1.5 border-b border-r pointer-events-none", isDark ? "border-zinc-600" : "border-zinc-300")} />
        </Link>

        {/* Admin Panel Title */}
        <div className={cn(
          "mt-3 flex items-center gap-2 px-3 py-2",
          isDark ? "text-zinc-300" : "text-zinc-700"
        )}>
          <ShieldIcon className={cn("w-4 h-4 shrink-0", isDark ? "text-amber-500" : "text-amber-600")} />
          <span className="text-xs font-medium uppercase tracking-wider">
            Admin Panel
          </span>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2">
        <SidebarGroup>
          <SidebarGroupLabel className={cn(
            "text-[10px] uppercase tracking-wider font-medium px-2",
            isDark ? "text-zinc-600" : "text-zinc-400"
          )}>
            Management
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                const isActive = pathname === item.href || (item.href !== "/admin" && pathname.startsWith(item.href));
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      className={cn(
                        "transition-colors text-xs rounded-none",
                        isDark
                          ? "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50 data-[active=true]:bg-zinc-800/80 data-[active=true]:text-zinc-100"
                          : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200/50 data-[active=true]:bg-zinc-200/80 data-[active=true]:text-zinc-900"
                      )}
                    >
                      <Link href={item.href}>
                        <item.icon className="w-4 h-4" />
                        <span className={isActive ? "uppercase opacity-100" : "uppercase opacity-50 hover:opacity-100"}>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className={cn("p-4 border-t", isDark ? "border-zinc-200/10" : "border-zinc-300")}>
        {/* User Menu */}
        <div className="relative">
          <button
            onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
            className={cn(
              "relative w-full flex items-center gap-3 px-3 py-2 text-left transition-colors border group",
              isDark
                ? "bg-zinc-900/50 border-zinc-700/50 hover:border-zinc-500"
                : "bg-white border-zinc-200 hover:border-zinc-400"
            )}
          >
            {/* Avatar */}
            <div className={cn(
              "w-8 h-8 flex items-center justify-center text-xs font-medium uppercase",
              isDark
                ? "bg-amber-900/50 text-amber-400 border border-amber-700/50"
                : "bg-amber-100 text-amber-700 border border-amber-300"
            )}>
              {user.initials}
            </div>
            <div className="flex-1 min-w-0">
              <div className={cn(
                "text-xs font-medium truncate flex items-center gap-1.5",
                isDark ? "text-zinc-200" : "text-zinc-800"
              )}>
                {user.name}
                <span className={cn(
                  "text-[9px] px-1.5 py-0.5 uppercase tracking-wider",
                  isDark ? "bg-amber-900/50 text-amber-400" : "bg-amber-100 text-amber-700"
                )}>
                  Admin
                </span>
              </div>
              <div className={cn(
                "text-[10px] truncate",
                isDark ? "text-zinc-500" : "text-zinc-500"
              )}>
                {user.email}
              </div>
            </div>
            <ChevronUpIcon className={cn(
              "w-4 h-4 shrink-0 transition-transform",
              isDark ? "text-zinc-500" : "text-zinc-400",
              isUserMenuOpen && "rotate-180"
            )} />

            {/* Corner accents */}
            <div className={cn("absolute top-0 left-0 w-1.5 h-1.5 border-t border-l pointer-events-none", isDark ? "border-zinc-600" : "border-zinc-300")} />
            <div className={cn("absolute top-0 right-0 w-1.5 h-1.5 border-t border-r pointer-events-none", isDark ? "border-zinc-600" : "border-zinc-300")} />
            <div className={cn("absolute bottom-0 left-0 w-1.5 h-1.5 border-b border-l pointer-events-none", isDark ? "border-zinc-600" : "border-zinc-300")} />
            <div className={cn("absolute bottom-0 right-0 w-1.5 h-1.5 border-b border-r pointer-events-none", isDark ? "border-zinc-600" : "border-zinc-300")} />
          </button>

          {/* User Dropdown Menu */}
          {isUserMenuOpen && (
            <div className={cn(
              "absolute bottom-full left-0 right-0 mb-1 z-50 border shadow-lg",
              isDark
                ? "bg-[#0f0f0f] border-zinc-700/50 shadow-black/40"
                : "bg-white border-zinc-200 shadow-zinc-200/40"
            )}>
              {/* Corner accents on dropdown */}
              <div className={cn("absolute top-0 left-0 w-1.5 h-1.5 border-t border-l pointer-events-none", isDark ? "border-zinc-500" : "border-zinc-400")} />
              <div className={cn("absolute top-0 right-0 w-1.5 h-1.5 border-t border-r pointer-events-none", isDark ? "border-zinc-500" : "border-zinc-400")} />
              <div className={cn("absolute bottom-0 left-0 w-1.5 h-1.5 border-b border-l pointer-events-none", isDark ? "border-zinc-500" : "border-zinc-400")} />
              <div className={cn("absolute bottom-0 right-0 w-1.5 h-1.5 border-b border-r pointer-events-none", isDark ? "border-zinc-500" : "border-zinc-400")} />

              <Link
                href="/account"
                onClick={() => setIsUserMenuOpen(false)}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 text-xs transition-colors",
                  isDark
                    ? "hover:bg-zinc-800 text-zinc-300"
                    : "hover:bg-zinc-100 text-zinc-700"
                )}
              >
                <UserIcon className={cn("w-4 h-4", isDark ? "text-zinc-500" : "text-zinc-400")} />
                <span className="uppercase tracking-wider">Account Settings</span>
              </Link>

              {/* Divider */}
              <div className={cn("border-t my-1", isDark ? "border-zinc-700/50" : "border-zinc-200")} />

              {/* Sign Out */}
              <button
                onClick={() => {
                  setIsUserMenuOpen(false);
                  handleSignOut();
                }}
                className={cn(
                  "w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors text-left",
                  isDark
                    ? "hover:bg-zinc-800 text-red-400/80"
                    : "hover:bg-zinc-100 text-red-600"
                )}
              >
                <LogOutIcon className="w-4 h-4" />
                <span className="uppercase tracking-wider">Sign Out</span>
              </button>
            </div>
          )}
        </div>

        {/* Version */}
        <div className={cn("text-[10px] uppercase tracking-wider mt-3 text-center", isDark ? "text-zinc-600" : "text-zinc-400")}>
          StellarStack v{process.env.NEXT_PUBLIC_GIT_COMMIT_HASH?.slice(0, 7) || "dev"}-alpha
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
