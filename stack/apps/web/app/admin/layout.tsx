"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme as useNextTheme } from "next-themes";
import { SidebarProvider, SidebarInset } from "@workspace/ui/components/sidebar";
import { AdminSidebar } from "@/components/admin-sidebar";
import { useAuth } from "@/components/auth-provider";
import { cn } from "@workspace/ui/lib/utils";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { resolvedTheme } = useNextTheme();
  const { isAdmin, isLoading, isAuthenticated } = useAuth();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Redirect non-admins
  useEffect(() => {
    if (!isLoading && isAuthenticated && !isAdmin) {
      router.push("/servers");
    }
    if (!isLoading && !isAuthenticated) {
      router.push("/");
    }
  }, [isAdmin, isLoading, isAuthenticated, router]);

  const isDark = mounted ? resolvedTheme === "dark" : true;

  // Show loading while checking auth
  if (isLoading || !mounted) {
    return (
      <div className={cn(
        "min-h-svh flex items-center justify-center",
        isDark ? "bg-[#0b0b0a]" : "bg-[#f5f5f4]"
      )}>
        <div className={cn(
          "text-sm uppercase tracking-wider",
          isDark ? "text-zinc-500" : "text-zinc-400"
        )}>
          Loading...
        </div>
      </div>
    );
  }

  // Don't render if not admin
  if (!isAdmin) {
    return null;
  }

  return (
    <SidebarProvider>
      <AdminSidebar isDark={isDark} />
      <SidebarInset className={cn(
        "transition-colors",
        isDark ? "bg-[#0b0b0a]" : "bg-[#f5f5f4]"
      )}>
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
