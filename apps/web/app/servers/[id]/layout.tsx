"use client";

import { useParams } from "next/navigation";
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
const PersistentBackground = memo(function PersistentBackground() {
  return (
    <>
      <AnimatedBackground />
      <FloatingDots count={15} />
    </>
  );
});

// Wrapper component that checks server status and shows placeholder if needed
function ServerStatusWrapper({ children }: { children: React.ReactNode }) {
  const { server } = useServer();

  // Show suspended placeholder if server is suspended
  if (server?.status === "SUSPENDED") {
    return (
      <div className="min-h-svh bg-[#0b0b0a]">
        <ServerSuspendedPlaceholder serverName={server?.name} />
      </div>
    );
  }

  // Show maintenance placeholder if server is under maintenance
  if (server?.status === "MAINTENANCE") {
    return (
      <div className="min-h-svh bg-[#0b0b0a]">
        <ServerMaintenancePlaceholder serverName={server?.name} />
      </div>
    );
  }

  // Show restoring placeholder if server is being restored from backup
  if (server?.status === "RESTORING") {
    return (
      <div className="min-h-svh bg-[#0b0b0a]">
        <ServerRestoringPlaceholder serverName={server?.name} />
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

  return (
    <UploadProvider>
      <ServerProvider serverId={serverId}>
        {/* Persistent background that doesn't re-render on navigation */}
        <PersistentBackground />

        <SidebarProvider>
          <AppSidebar />
          <SidebarInset>
            <ServerStatusWrapper>
              {children}
              <UploadProgressIndicator />
            </ServerStatusWrapper>
          </SidebarInset>
        </SidebarProvider>
      </ServerProvider>
    </UploadProvider>
  );
}
