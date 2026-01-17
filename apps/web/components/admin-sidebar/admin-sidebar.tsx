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
  SettingsIcon,
} from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";
import { useAuth } from "@/components/auth-provider";

// Admin navigation items
const navItems = [
  { title: "Overview", icon: LayoutDashboardIcon, href: "/admin" },
  { title: "Nodes", icon: CpuIcon, href: "/admin/nodes" },
  { title: "Locations", icon: MapPinIcon, href: "/admin/locations" },
  { title: "Servers", icon: ServerIcon, href: "/admin/servers" },
  { title: "Blueprints", icon: PackageIcon, href: "/admin/blueprints" },
  { title: "Users", icon: UsersIcon, href: "/admin/users" },
  { title: "Settings", icon: SettingsIcon, href: "/admin/settings" },
];

interface AdminSidebarProps {}

export const AdminSidebar = ({}: AdminSidebarProps) => {
  const pathname = usePathname();
  const router = useRouter();
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

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <Sidebar
      className={cn(
        "border-r shadow-lg dark:border-zinc-200/10 dark:bg-gradient-to-b dark:from-[#141414] dark:via-[#0f0f0f] dark:to-[#0a0a0a] dark:shadow-black/20 light:border-zinc-300 light:bg-gradient-to-b light:from-white light:via-zinc-50 light:to-zinc-100 light:shadow-zinc-400/20"
      )}
    >
      <SidebarHeader
        className={cn("border-b p-4 dark:border-zinc-200/10 light:border-zinc-300")}
      >
        {/* Back to Servers */}
        <Link
          href="/servers"
          className={cn(
            "group relative flex w-full items-center gap-2 border px-3 py-2 text-left transition-colors dark:border-zinc-700/50 dark:bg-zinc-900/50 dark:text-zinc-400 dark:hover:border-zinc-500 dark:hover:text-zinc-200 light:border-zinc-200 light:bg-white light:text-zinc-600 light:hover:border-zinc-400 light:hover:text-zinc-800"
          )}
        >
          <ArrowLeftIcon
            className={cn(
              "h-4 w-4 shrink-0 transition-transform group-hover:-translate-x-0.5 dark:text-zinc-500 light:text-zinc-400"
            )}
          />
          <span className="text-xs font-medium tracking-wider uppercase">Back to Panel</span>

          {/* Corner accents */}
          <div
            className={cn(
              "pointer-events-none absolute top-0 left-0 h-1.5 w-1.5 border-t border-l dark:border-zinc-600 light:border-zinc-300"
            )}
          />
          <div
            className={cn(
              "pointer-events-none absolute top-0 right-0 h-1.5 w-1.5 border-t border-r dark:border-zinc-600 light:border-zinc-300"
            )}
          />
          <div
            className={cn(
              "pointer-events-none absolute bottom-0 left-0 h-1.5 w-1.5 border-b border-l dark:border-zinc-600 light:border-zinc-300"
            )}
          />
          <div
            className={cn(
              "pointer-events-none absolute right-0 bottom-0 h-1.5 w-1.5 border-r border-b dark:border-zinc-600 light:border-zinc-300"
            )}
          />
        </Link>

        {/* Admin Panel Title */}
        <div
          className={cn(
            "mt-3 flex items-center gap-2 px-3 py-2 dark:text-zinc-300 light:text-zinc-700"
          )}
        >
          <ShieldIcon
            className={cn("h-4 w-4 shrink-0 dark:text-amber-500 light:text-amber-600")}
          />
          <span className="text-xs font-medium tracking-wider uppercase">Admin Panel</span>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2">
        <SidebarGroup>
          <SidebarGroupLabel
            className={cn(
              "px-2 text-[10px] font-medium tracking-wider uppercase dark:text-zinc-600 light:text-zinc-400"
            )}
          >
            Management
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                const isActive =
                  pathname === item.href ||
                  (item.href !== "/admin" && pathname.startsWith(item.href));
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      className={cn(
                        "rounded-none text-xs transition-colors dark:text-zinc-400 dark:hover:bg-zinc-800/50 dark:hover:text-zinc-100 dark:data-[active=true]:bg-zinc-800/80 dark:data-[active=true]:text-zinc-100 light:text-zinc-600 light:hover:bg-zinc-200/50 light:hover:text-zinc-900 light:data-[active=true]:bg-zinc-200/80 light:data-[active=true]:text-zinc-900"
                      )}
                    >
                      <Link href={item.href}>
                        <item.icon className="h-4 w-4" />
                        <span
                          className={
                            isActive
                              ? "uppercase opacity-100"
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
        className={cn("border-t p-4 dark:border-zinc-200/10 light:border-zinc-300")}
      >
        {/* User Menu */}
        <div className="relative">
          <button
            onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
            className={cn(
              "group relative flex w-full items-center gap-3 border px-3 py-2 text-left transition-colors dark:border-zinc-700/50 dark:bg-zinc-900/50 dark:hover:border-zinc-500 light:border-zinc-200 light:bg-white light:hover:border-zinc-400"
            )}
          >
            {/* Avatar */}
            <div
              className={cn(
                "flex h-8 w-8 items-center justify-center text-xs font-medium uppercase dark:border dark:border-amber-700/50 dark:bg-amber-900/50 dark:text-amber-400 light:border light:border-amber-300 light:bg-amber-100 light:text-amber-700"
              )}
            >
              {user.initials}
            </div>
            <div className="min-w-0 flex-1">
              <div
                className={cn(
                  "flex items-center gap-1.5 truncate text-xs font-medium dark:text-zinc-200 light:text-zinc-800"
                )}
              >
                {user.name}
                <span
                  className={cn(
                    "px-1.5 py-0.5 text-[9px] tracking-wider uppercase dark:bg-amber-900/50 dark:text-amber-400 light:bg-amber-100 light:text-amber-700"
                  )}
                >
                  Admin
                </span>
              </div>
              <div
                className={cn("truncate text-[10px] text-zinc-500")}
              >
                {user.email}
              </div>
            </div>
            <ChevronUpIcon
              className={cn(
                "h-4 w-4 shrink-0 transition-transform dark:text-zinc-500 light:text-zinc-400",
                isUserMenuOpen && "rotate-180"
              )}
            />

            {/* Corner accents */}
            <div
              className={cn(
                "pointer-events-none absolute top-0 left-0 h-1.5 w-1.5 border-t border-l border-zinc-600"
              )}
            />
            <div
              className={cn(
                "pointer-events-none absolute top-0 right-0 h-1.5 w-1.5 border-t border-r border-zinc-600"
              )}
            />
            <div
              className={cn(
                "pointer-events-none absolute bottom-0 left-0 h-1.5 w-1.5 border-b border-l border-zinc-600"
              )}
            />
            <div
              className={cn(
                "pointer-events-none absolute right-0 bottom-0 h-1.5 w-1.5 border-r border-b border-zinc-600"
              )}
            />
          </button>

          {/* User Dropdown Menu */}
          {isUserMenuOpen && (
            <div
              className={cn(
                "absolute right-0 bottom-full left-0 z-50 mb-1 border shadow-lg dark:border-zinc-700/50 dark:bg-[#0f0f0f] dark:shadow-black/40 light:border-zinc-200 light:bg-white light:shadow-zinc-200/40"
              )}
            >
              {/* Corner accents on dropdown */}
              <div
                className={cn(
                  "pointer-events-none absolute top-0 left-0 h-1.5 w-1.5 border-t border-l dark:border-zinc-500 light:border-zinc-400"
                )}
              />
              <div
                className={cn(
                  "pointer-events-none absolute top-0 right-0 h-1.5 w-1.5 border-t border-r dark:border-zinc-500 light:border-zinc-400"
                )}
              />
              <div
                className={cn(
                  "pointer-events-none absolute bottom-0 left-0 h-1.5 w-1.5 border-b border-l dark:border-zinc-500 light:border-zinc-400"
                )}
              />
              <div
                className={cn(
                  "pointer-events-none absolute right-0 bottom-0 h-1.5 w-1.5 border-r border-b dark:border-zinc-500 light:border-zinc-400"
                )}
              />

              <Link
                href="/account"
                onClick={() => setIsUserMenuOpen(false)}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 text-xs transition-colors dark:text-zinc-300 dark:hover:bg-zinc-800 light:text-zinc-700 light:hover:bg-zinc-100"
                )}
              >
                <UserIcon className={cn("h-4 w-4 dark:text-zinc-500 light:text-zinc-400")} />
                <span className="tracking-wider uppercase">Account Settings</span>
              </Link>

              {/* Divider */}
              <div
                className={cn("my-1 border-t dark:border-zinc-700/50 light:border-zinc-200")}
              />

              {/* Sign Out */}
              <button
                onClick={() => {
                  setIsUserMenuOpen(false);
                  handleSignOut();
                }}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors dark:text-red-400/80 dark:hover:bg-zinc-800 light:text-red-600 light:hover:bg-zinc-100"
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
            "mt-3 text-center text-[10px] tracking-wider uppercase dark:text-zinc-600 light:text-zinc-400"
          )}
        >
          StellarStack v{process.env.NEXT_PUBLIC_GIT_COMMIT_HASH?.slice(0, 7) || "dev"}-alpha
        </div>
      </SidebarFooter>
    </Sidebar>
  );
};
