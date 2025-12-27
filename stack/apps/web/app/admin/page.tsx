"use client";

import { useEffect, useState } from "react";
import { useTheme as useNextTheme } from "next-themes";
import { cn } from "@workspace/ui/lib/utils";
import { AnimatedBackground } from "@workspace/ui/components/shared/AnimatedBackground";
import { FadeIn, FloatingDots } from "@workspace/ui/components/shared/Animations";
import { CpuIcon, MapPinIcon, ServerIcon, PackageIcon, UsersIcon, ActivityIcon } from "lucide-react";
import Link from "next/link";
import { nodes, locations, servers, blueprints, account } from "@/lib/api";
import type { Node, Location, Server, Blueprint, User } from "@/lib/api";

interface StatCardProps {
  title: string;
  value: number | string;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
  isDark: boolean;
  color?: string;
}

function StatCard({ title, value, icon: Icon, href, isDark, color = "zinc" }: StatCardProps) {
  const colorClasses = {
    zinc: isDark ? "border-zinc-700/50 text-zinc-400" : "border-zinc-300 text-zinc-600",
    green: isDark ? "border-green-700/50 text-green-400" : "border-green-300 text-green-600",
    amber: isDark ? "border-amber-700/50 text-amber-400" : "border-amber-300 text-amber-600",
    blue: isDark ? "border-blue-700/50 text-blue-400" : "border-blue-300 text-blue-600",
  };

  return (
    <Link
      href={href}
      className={cn(
        "relative p-6 border transition-all group hover:scale-[1.02]",
        isDark
          ? "bg-zinc-900/50 border-zinc-700/50 hover:border-zinc-500"
          : "bg-white border-zinc-200 hover:border-zinc-400"
      )}
    >
      {/* Corner accents */}
      <div className={cn("absolute top-0 left-0 w-2 h-2 border-t border-l", colorClasses[color as keyof typeof colorClasses] || colorClasses.zinc)} />
      <div className={cn("absolute top-0 right-0 w-2 h-2 border-t border-r", colorClasses[color as keyof typeof colorClasses] || colorClasses.zinc)} />
      <div className={cn("absolute bottom-0 left-0 w-2 h-2 border-b border-l", colorClasses[color as keyof typeof colorClasses] || colorClasses.zinc)} />
      <div className={cn("absolute bottom-0 right-0 w-2 h-2 border-b border-r", colorClasses[color as keyof typeof colorClasses] || colorClasses.zinc)} />

      <div className="flex items-center justify-between">
        <div>
          <div className={cn(
            "text-xs uppercase tracking-wider mb-1",
            isDark ? "text-zinc-500" : "text-zinc-400"
          )}>
            {title}
          </div>
          <div className={cn(
            "text-3xl font-light",
            isDark ? "text-zinc-100" : "text-zinc-800"
          )}>
            {value}
          </div>
        </div>
        <Icon className={cn(
          "w-8 h-8 opacity-50 group-hover:opacity-100 transition-opacity",
          colorClasses[color as keyof typeof colorClasses] || colorClasses.zinc
        )} />
      </div>
    </Link>
  );
}

export default function AdminOverviewPage() {
  const { resolvedTheme } = useNextTheme();
  const [mounted, setMounted] = useState(false);
  const [stats, setStats] = useState({
    nodes: 0,
    nodesOnline: 0,
    locations: 0,
    servers: 0,
    serversRunning: 0,
    blueprints: 0,
    users: 0,
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    async function fetchStats() {
      try {
        const [nodesList, locationsList, serversList, blueprintsList, usersList] = await Promise.all([
          nodes.list().catch(() => [] as Node[]),
          locations.list().catch(() => [] as Location[]),
          servers.list().catch(() => [] as Server[]),
          blueprints.list().catch(() => [] as Blueprint[]),
          account.listUsers().catch(() => [] as User[]),
        ]);

        setStats({
          nodes: nodesList.length,
          nodesOnline: nodesList.filter(n => n.isOnline).length,
          locations: locationsList.length,
          servers: serversList.length,
          serversRunning: serversList.filter(s => s.status === "RUNNING").length,
          blueprints: blueprintsList.length,
          users: usersList.length,
        });
      } catch (error) {
        console.error("Failed to fetch stats:", error);
      } finally {
        setIsLoading(false);
      }
    }

    fetchStats();
  }, []);

  const isDark = mounted ? resolvedTheme === "dark" : true;

  return (
    <div className={cn("min-h-svh transition-colors relative", isDark ? "bg-[#0b0b0a]" : "bg-[#f5f5f4]")}>
      <AnimatedBackground isDark={isDark} />
      <FloatingDots isDark={isDark} count={15} />

      <div className="relative p-8">
        <div className="max-w-6xl mx-auto">
          <FadeIn delay={0}>
            {/* Header */}
            <div className="mb-8">
              <h1 className={cn(
                "text-2xl font-light tracking-wider",
                isDark ? "text-zinc-100" : "text-zinc-800"
              )}>
                ADMIN DASHBOARD
              </h1>
              <p className={cn(
                "text-sm mt-1",
                isDark ? "text-zinc-500" : "text-zinc-500"
              )}>
                System overview and quick stats
              </p>
            </div>
          </FadeIn>

          {/* Stats Grid */}
          <FadeIn delay={0.1}>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        <StatCard
          title="Nodes"
          value={isLoading ? "..." : `${stats.nodesOnline}/${stats.nodes}`}
          icon={CpuIcon}
          href="/admin/nodes"
          isDark={isDark}
          color={stats.nodesOnline > 0 ? "green" : "zinc"}
        />
        <StatCard
          title="Locations"
          value={isLoading ? "..." : stats.locations}
          icon={MapPinIcon}
          href="/admin/locations"
          isDark={isDark}
          color="blue"
        />
        <StatCard
          title="Servers"
          value={isLoading ? "..." : `${stats.serversRunning}/${stats.servers}`}
          icon={ServerIcon}
          href="/admin/servers"
          isDark={isDark}
          color={stats.serversRunning > 0 ? "green" : "zinc"}
        />
        <StatCard
          title="Blueprints"
          value={isLoading ? "..." : stats.blueprints}
          icon={PackageIcon}
          href="/admin/blueprints"
          isDark={isDark}
          color="amber"
        />
        <StatCard
          title="Users"
          value={isLoading ? "..." : stats.users}
              icon={UsersIcon}
              href="/admin/users"
              isDark={isDark}
            />
            </div>
          </FadeIn>

          {/* Quick Actions */}
          <FadeIn delay={0.2}>
            <div className="mt-8">
              <h2 className={cn(
                "text-sm font-medium uppercase tracking-wider mb-4",
                isDark ? "text-zinc-400" : "text-zinc-600"
              )}>
                Quick Actions
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Link
            href="/admin/nodes"
            className={cn(
              "relative p-4 border text-center transition-all hover:scale-[1.02]",
              isDark
                ? "bg-zinc-900/50 border-zinc-700/50 hover:border-green-500/50 text-zinc-300"
                : "bg-white border-zinc-200 hover:border-green-400 text-zinc-700"
            )}
          >
            <CpuIcon className={cn("w-6 h-6 mx-auto mb-2", isDark ? "text-green-400" : "text-green-600")} />
            <span className="text-xs uppercase tracking-wider">Add Node</span>
          </Link>
          <Link
            href="/admin/locations"
            className={cn(
              "relative p-4 border text-center transition-all hover:scale-[1.02]",
              isDark
                ? "bg-zinc-900/50 border-zinc-700/50 hover:border-blue-500/50 text-zinc-300"
                : "bg-white border-zinc-200 hover:border-blue-400 text-zinc-700"
            )}
          >
            <MapPinIcon className={cn("w-6 h-6 mx-auto mb-2", isDark ? "text-blue-400" : "text-blue-600")} />
            <span className="text-xs uppercase tracking-wider">Add Location</span>
          </Link>
          <Link
            href="/admin/blueprints"
            className={cn(
              "relative p-4 border text-center transition-all hover:scale-[1.02]",
              isDark
                ? "bg-zinc-900/50 border-zinc-700/50 hover:border-amber-500/50 text-zinc-300"
                : "bg-white border-zinc-200 hover:border-amber-400 text-zinc-700"
            )}
          >
            <PackageIcon className={cn("w-6 h-6 mx-auto mb-2", isDark ? "text-amber-400" : "text-amber-600")} />
            <span className="text-xs uppercase tracking-wider">Add Blueprint</span>
          </Link>
          <Link
            href="/admin/servers"
            className={cn(
              "relative p-4 border text-center transition-all hover:scale-[1.02]",
              isDark
                ? "bg-zinc-900/50 border-zinc-700/50 hover:border-purple-500/50 text-zinc-300"
                : "bg-white border-zinc-200 hover:border-purple-400 text-zinc-700"
            )}
          >
            <ServerIcon className={cn("w-6 h-6 mx-auto mb-2", isDark ? "text-purple-400" : "text-purple-600")} />
                <span className="text-xs uppercase tracking-wider">Create Server</span>
              </Link>
              </div>
            </div>
          </FadeIn>
        </div>
      </div>
    </div>
  );
}
