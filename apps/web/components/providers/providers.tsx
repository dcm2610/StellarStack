"use client"

import * as React from "react"
import { AuthProvider } from "@/components/auth-provider"
import { QueryProvider } from "@/components/query-provider"
import { WebSocketProvider } from "@/components/websocket-provider"
import { CommandPalette } from "@/components/command-palette"

export const Providers = ({ children }: { children: React.ReactNode }) => {
  return (
    <QueryProvider>
      <AuthProvider>
        <WebSocketProvider>
          {children}
          <CommandPalette />
        </WebSocketProvider>
      </AuthProvider>
    </QueryProvider>
  );
};
