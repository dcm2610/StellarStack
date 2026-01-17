"use client";

import { ServerIcon, RotateCcwIcon } from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";
import { motion } from "framer-motion";

interface ServerRestoringPlaceholderProps {
  serverName?: string;
}

export const ServerRestoringPlaceholder = ({
  serverName,
}: ServerRestoringPlaceholderProps) => {
  return (
    <div
      className={cn(
        "flex min-h-[60vh] flex-col items-center justify-center p-8",
        "text-zinc-300"
      )}
    >
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="flex flex-col items-center gap-6"
      >
        {/* Icon container */}
        <div className="relative">
          <div
            className={cn(
              "relative flex h-16 w-16 items-center justify-center border",
              "border-zinc-700 bg-zinc-900"
            )}
          >
            <ServerIcon className={cn("h-8 w-8", "text-zinc-600")} />
            <motion.div
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.3, duration: 0.3 }}
              className={cn(
                "absolute -right-2 -bottom-2 flex h-6 w-6 items-center justify-center rounded-full border",
                "border-blue-700 bg-blue-900/50"
              )}
            >
              <motion.div
                animate={{ rotate: -360 }}
                transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
              >
                <RotateCcwIcon className={cn("h-3 w-3", "text-blue-400")} />
              </motion.div>
            </motion.div>
          </div>
        </div>

        {/* Text content */}
        <div className="space-y-2 text-center">
          <h2
            className={cn(
              "text-lg font-medium tracking-wider uppercase",
              "text-zinc-200"
            )}
          >
            Restoring Backup
          </h2>
          {serverName && (
            <p className={cn("font-mono text-sm", "text-zinc-500")}>
              {serverName}
            </p>
          )}
        </div>

        {/* Info message */}
        <div
          className={cn(
            "mt-4 space-y-1 border p-4 text-center text-xs",
            "border-zinc-800 bg-zinc-900/50 text-zinc-500"
          )}
        >
          <p>This server is currently being restored from a backup.</p>
          <p>Please wait while your files are being recovered...</p>
        </div>

        {/* Loading indicator */}
        <div className="flex items-center gap-2">
          <div
            className={cn(
              "h-1.5 w-1.5 animate-pulse rounded-full",
              "bg-blue-500"
            )}
            style={{ animationDelay: "0ms" }}
          />
          <div
            className={cn(
              "h-1.5 w-1.5 animate-pulse rounded-full",
              "bg-blue-500"
            )}
            style={{ animationDelay: "300ms" }}
          />
          <div
            className={cn(
              "h-1.5 w-1.5 animate-pulse rounded-full",
              "bg-blue-500"
            )}
            style={{ animationDelay: "600ms" }}
          />
        </div>
      </motion.div>
    </div>
  );
};
