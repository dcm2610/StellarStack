"use client";

import { useParams } from "next/navigation";
import { SidebarProvider, SidebarInset } from "@workspace/ui/components/sidebar";
import { AppSidebar } from "../../../components/app-sidebar";
import { ServerProvider } from "../../../components/server-provider";

export default function ServerLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const params = useParams();
  const serverId = params.id as string;

  return (
    <ServerProvider serverId={serverId}>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          {children}
        </SidebarInset>
      </SidebarProvider>
    </ServerProvider>
  );
}
