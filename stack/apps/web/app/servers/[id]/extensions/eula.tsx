"use client";

import { useEffect, useState, useCallback } from "react";
import { useTheme } from "next-themes";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@workspace/ui/components/dialog";
import { Button } from "@workspace/ui/components/button";
import { cn } from "@workspace/ui/lib/utils";
import { toast } from "sonner";
import { servers } from "@/lib/api";
import type { ConsoleLine } from "@/hooks/useServerWebSocket";

// Patterns that indicate EULA acceptance is required
const EULA_PATTERNS = [
  /you need to agree to the eula/i,
  /failed to load eula/i,
  /go to eula\.txt/i,
  /eula=false/i,
  /by changing.*eula.*to.*true/i,
  /agree to the minecraft eula/i,
];

interface EulaExtensionProps {
  serverId: string;
  lines: ConsoleLine[];
  onRestart: () => Promise<void>;
}

export function EulaExtension({ serverId, lines, onRestart }: EulaExtensionProps) {
  const [showDialog, setShowDialog] = useState(false);
  const [isAccepting, setIsAccepting] = useState(false);
  const [hasShownDialog, setHasShownDialog] = useState(false);
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  // Check console lines for EULA-related messages
  const checkForEulaRequired = useCallback(() => {
    if (hasShownDialog) return;

    // Check last 50 lines for EULA messages
    const recentLines = lines.slice(-50);

    for (const line of recentLines) {
      const text = line.text.toLowerCase();

      for (const pattern of EULA_PATTERNS) {
        if (pattern.test(text)) {
          setShowDialog(true);
          setHasShownDialog(true);
          return;
        }
      }
    }
  }, [lines, hasShownDialog]);

  useEffect(() => {
    checkForEulaRequired();
  }, [checkForEulaRequired]);

  // Reset when server restarts (lines cleared)
  useEffect(() => {
    if (lines.length === 0) {
      setHasShownDialog(false);
    }
  }, [lines.length]);

  const handleAcceptEula = async () => {
    setIsAccepting(true);

    try {
      // Read the current eula.txt content
      let content: string;
      try {
        content = await servers.files.read(serverId, "eula.txt");
      } catch {
        // File might not exist yet, create it
        content = "eula=false";
      }

      // Replace eula=false with eula=true
      const newContent = content.replace(/eula\s*=\s*false/gi, "eula=true");

      // If no replacement was made, just set it to true
      const finalContent = newContent.includes("eula=true")
        ? newContent
        : "# By changing the setting below to TRUE you are indicating your agreement to the Minecraft EULA (https://aka.ms/MinecraftEULA).\neula=true\n";

      // Write the updated file
      await servers.files.write(serverId, "eula.txt", finalContent);

      toast.success("EULA accepted! Restarting server...");
      setShowDialog(false);

      // Restart the server
      await onRestart();

    } catch (error) {
      console.error("Failed to accept EULA:", error);
      toast.error("Failed to accept EULA. Please try manually editing eula.txt");
    } finally {
      setIsAccepting(false);
    }
  };

  const handleDecline = () => {
    setShowDialog(false);
    toast.info("EULA not accepted. Server cannot start without accepting the EULA.");
  };

  return (
    <Dialog open={showDialog} onOpenChange={setShowDialog}>
      <DialogContent isDark={isDark} className="max-w-lg">
        <DialogHeader>
          <DialogTitle isDark={isDark}>Minecraft EULA Required</DialogTitle>
          <DialogDescription isDark={isDark} className="pt-2">
            To run a Minecraft server, you must accept the Minecraft End User License Agreement.
          </DialogDescription>
        </DialogHeader>

        <div className={cn(
          "p-4 text-sm space-y-3",
          isDark ? "bg-zinc-900/50 border border-zinc-800" : "bg-zinc-100 border border-zinc-200"
        )}>
          <p className={isDark ? "text-zinc-300" : "text-zinc-700"}>
            By clicking &quot;Accept&quot;, you agree to the{" "}
            <a
              href="https://aka.ms/MinecraftEULA"
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                "underline hover:no-underline",
                isDark ? "text-blue-400 hover:text-blue-300" : "text-blue-600 hover:text-blue-700"
              )}
            >
              Minecraft EULA
            </a>
            .
          </p>
          <p className={cn(
            "text-xs",
            isDark ? "text-zinc-500" : "text-zinc-500"
          )}>
            This will update the eula.txt file and restart your server.
          </p>
        </div>

        <DialogFooter className="pt-2">
          <Button
            variant="outline"
            onClick={handleDecline}
            disabled={isAccepting}
            className={cn(
              isDark
                ? "border-zinc-700 text-zinc-400 hover:text-zinc-100 hover:border-zinc-500"
                : "border-zinc-300 text-zinc-600 hover:text-zinc-900 hover:border-zinc-400"
            )}
          >
            Decline
          </Button>
          <Button
            onClick={handleAcceptEula}
            disabled={isAccepting}
            className={cn(
              "transition-all",
              isDark
                ? "bg-green-600 hover:bg-green-700 text-white"
                : "bg-green-600 hover:bg-green-700 text-white"
            )}
          >
            {isAccepting ? "Accepting..." : "Accept EULA"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
