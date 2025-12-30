"use client";

import { useEffect, useState, memo } from "react";
import { useRouter } from "next/navigation";
import { useTheme as useNextTheme } from "next-themes";
import { SidebarProvider, SidebarInset } from "@workspace/ui/components/sidebar";
import { AdminSidebar } from "@/components/admin-sidebar";
import { useAuth } from "@/components/auth-provider";
import { AnimatedBackground } from "@workspace/ui/components/animated-background";
import { FloatingDots } from "@workspace/ui/components/floating-particles";
import { cn } from "@workspace/ui/lib/utils";

// Memoized background component to prevent re-renders
const PersistentBackground = memo(function PersistentBackground({ isDark }: { isDark: boolean }) {
  return (
    <>
      <AnimatedBackground isDark={isDark} />
      <FloatingDots isDark={isDark} count={15} />
    </>
  );
});

export default function AdminLayout({ children }: { children: React.ReactNode }) {
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
      <div
        className={cn(
          "flex min-h-svh items-center justify-center",
          isDark ? "bg-[#0b0b0a]" : "bg-[#f5f5f4]"
        )}
      >
        <PersistentBackground isDark={isDark} />
        <div
          className={cn(
            "relative z-10 text-sm tracking-wider uppercase",
            isDark ? "text-zinc-500" : "text-zinc-400"
          )}
        >
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
    <>
      <PersistentBackground isDark={isDark} />
      <SidebarProvider>
        <AdminSidebar isDark={isDark} />
        <SidebarInset
          className={cn("transition-colors", isDark ? "bg-transparent" : "bg-transparent")}
        >
          {children}
        </SidebarInset>
      </SidebarProvider>
    </>
  );
}
