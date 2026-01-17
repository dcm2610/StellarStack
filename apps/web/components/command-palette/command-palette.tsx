"use client";

import { useEffect, useState, useCallback, useContext, createContext } from "react";
import { useRouter, useParams, usePathname } from "next/navigation";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@workspace/ui/components/command";
import {
  ServerIcon,
  PlayIcon,
  StopCircleIcon,
  RefreshCwIcon,
  FolderIcon,
  ArchiveIcon,
  SettingsIcon,
  LayoutDashboardIcon,
  CalendarIcon,
  NetworkIcon,
  DatabaseIcon,
  UsersIcon,
  ActivityIcon,
  ShieldIcon,
  XIcon,
} from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";

interface CommandPaletteProps {}

export const CommandPalette = ({}: CommandPaletteProps) => {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const params = useParams();
  const pathname = usePathname();
  const serverId = params.id as string | undefined;

  // Check if we're on a server page (but don't use server context here)
  const isServerPage = pathname?.includes("/servers/") && serverId && !pathname?.includes("/servers/new");

  // Keyboard shortcut
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const runCommand = useCallback((command: () => unknown) => {
    setOpen(false);
    command();
  }, []);

  const navigateTo = useCallback((path: string) => {
    runCommand(() => router.push(path));
  }, [router, runCommand]);

  // Navigation items for server pages
  const serverNavItems = serverId && isServerPage ? [
    { title: "Overview", icon: LayoutDashboardIcon, href: `/servers/${serverId}/overview` },
    { title: "Files", icon: FolderIcon, href: `/servers/${serverId}/files` },
    { title: "Backups", icon: ArchiveIcon, href: `/servers/${serverId}/backups` },
    { title: "Schedules", icon: CalendarIcon, href: `/servers/${serverId}/schedules` },
    { title: "Users", icon: UsersIcon, href: `/servers/${serverId}/users` },
    { title: "Databases", icon: DatabaseIcon, href: `/servers/${serverId}/databases` },
    { title: "Network", icon: NetworkIcon, href: `/servers/${serverId}/network` },
    { title: "Activity", icon: ActivityIcon, href: `/servers/${serverId}/activity` },
    { title: "Startup", icon: PlayIcon, href: `/servers/${serverId}/startup` },
    { title: "Settings", icon: SettingsIcon, href: `/servers/${serverId}/settings` },
  ] : [];

  // Global navigation
  const globalNavItems = [
    { title: "All Servers", icon: ServerIcon, href: "/servers" },
    { title: "Admin Panel", icon: ShieldIcon, href: "/admin" },
  ];

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="Command Palette"
      description="Search for a command to run..."
    >
      <CommandInput placeholder="Type a command or search..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        {/* Server Navigation - navigation only, no server actions (those require ServerProvider context) */}
        {serverNavItems.length > 0 && (
          <>
            <CommandGroup heading="Server Navigation">
              {serverNavItems.map((item) => (
                <CommandItem
                  key={item.href}
                  onSelect={() => navigateTo(item.href)}
                  className={cn(
                    "cursor-pointer",
                    pathname === item.href && "bg-accent"
                  )}
                >
                  <item.icon className="mr-2 h-4 w-4" />
                  <span>{item.title}</span>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        {/* Global Navigation */}
        <CommandGroup heading="Navigation">
          {globalNavItems.map((item) => (
            <CommandItem
              key={item.href}
              onSelect={() => navigateTo(item.href)}
              className="cursor-pointer"
            >
              <item.icon className="mr-2 h-4 w-4" />
              <span>{item.title}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
};
