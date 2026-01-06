"use client";

import { useParams } from "next/navigation";
import { useTheme } from "next-themes";
import { useState, useEffect, memo } from "react";
import { SidebarProvider, SidebarInset } from "@workspace/ui/components/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { ServerProvider, useServer } from "@/components/server-provider";
import { AnimatedBackground } from "@workspace/ui/components/animated-background";
import { FloatingDots } from "@workspace/ui/components/floating-particles";
import { ServerMaintenancePlaceholder } from "@/components/server-maintenance-placeholder/server-maintenance-placeholder";
import { ServerSuspendedPlaceholder } from "@/components/server-suspended-placeholder/server-suspended-placeholder";
import { ServerRestoringPlaceholder } from "@/components/server-restoring-placeholder/server-restoring-placeholder";
import { cn } from "@workspace/ui/lib/utils";
import { UploadProvider } from "@/components/upload-provider";
import { UploadProgressIndicator } from "@/components/upload-progress-indicator";

// Memoized background component to prevent re-renders
const PersistentBackground = memo(function PersistentBackground({ isDark }: { isDark: boolean }) {
  return (
    <>
      <AnimatedBackground isDark={isDark} />
      <FloatingDots isDark={isDark} count={15} />
    </>
  );
});

// Wrapper component that checks server status and shows placeholder if needed
function ServerStatusWrapper({ children, isDark }: { children: React.ReactNode; isDark: boolean }) {
  const { server } = useServer();

  // Show suspended placeholder if server is suspended
  if (server?.status === "SUSPENDED") {
    return (
      <div className={cn("min-h-svh", isDark ? "bg-[#0b0b0a]" : "bg-[#f5f5f4]")}>
        <ServerSuspendedPlaceholder isDark={isDark} serverName={server?.name} />
      </div>
    );
  }

  // Show maintenance placeholder if server is under maintenance
  if (server?.status === "MAINTENANCE") {
    return (
      <div className={cn("min-h-svh", isDark ? "bg-[#0b0b0a]" : "bg-[#f5f5f4]")}>
        <ServerMaintenancePlaceholder isDark={isDark} serverName={server?.name} />
      </div>
    );
  }

  // Show restoring placeholder if server is being restored from backup
  if (server?.status === "RESTORING") {
    return (
      <div className={cn("min-h-svh", isDark ? "bg-[#0b0b0a]" : "bg-[#f5f5f4]")}>
        <ServerRestoringPlaceholder isDark={isDark} serverName={server?.name} />
      </div>
    );
  }

  return <>{children}</>;
}

export default function ServerLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const params = useParams();
  const serverId = params.id as string;
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = mounted ? resolvedTheme === "dark" : true;

  return (
    <UploadProvider>
      <ServerProvider serverId={serverId}>
        {/* Persistent background that doesn't re-render on navigation */}
        <PersistentBackground isDark={isDark} />

        <SidebarProvider>
          <AppSidebar />
          <SidebarInset>
            <ServerStatusWrapper isDark={isDark}>
              {children}
              <UploadProgressIndicator />
            </ServerStatusWrapper>
          </SidebarInset>
        </SidebarProvider>
      </ServerProvider>
    </UploadProvider>
  );
}
