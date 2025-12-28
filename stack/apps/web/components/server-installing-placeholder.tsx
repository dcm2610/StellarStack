"use client";

import { Loader2Icon, ServerIcon, DownloadIcon } from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";
import { motion } from "framer-motion";

interface ServerInstallingPlaceholderProps {
  isDark?: boolean;
  serverName?: string;
}

export function ServerInstallingPlaceholder({
  isDark = true,
  serverName
}: ServerInstallingPlaceholderProps) {
  return (
    <div className={cn(
      "flex flex-col items-center justify-center min-h-[60vh] p-8",
      isDark ? "text-zinc-300" : "text-zinc-700"
    )}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="flex flex-col items-center gap-6"
      >
        {/* Icon container */}
        <div className="relative">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
            className={cn(
              "absolute inset-0 rounded-full border-2 border-dashed",
              isDark ? "border-zinc-700" : "border-zinc-300"
            )}
            style={{ width: 80, height: 80, margin: -8 }}
          />
          <div className={cn(
            "relative w-16 h-16 flex items-center justify-center border",
            isDark
              ? "bg-zinc-900 border-zinc-700"
              : "bg-white border-zinc-300"
          )}>
            <ServerIcon className={cn(
              "w-8 h-8",
              isDark ? "text-zinc-500" : "text-zinc-400"
            )} />
            <motion.div
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.3, duration: 0.3 }}
              className={cn(
                "absolute -bottom-2 -right-2 w-6 h-6 flex items-center justify-center rounded-full border",
                isDark
                  ? "bg-zinc-800 border-zinc-600"
                  : "bg-zinc-100 border-zinc-300"
              )}
            >
              <DownloadIcon className={cn(
                "w-3 h-3",
                isDark ? "text-blue-400" : "text-blue-600"
              )} />
            </motion.div>
          </div>
        </div>

        {/* Text content */}
        <div className="text-center space-y-2">
          <h2 className={cn(
            "text-lg font-medium uppercase tracking-wider",
            isDark ? "text-zinc-200" : "text-zinc-800"
          )}>
            Installing Server
          </h2>
          {serverName && (
            <p className={cn(
              "text-sm font-mono",
              isDark ? "text-zinc-500" : "text-zinc-500"
            )}>
              {serverName}
            </p>
          )}
        </div>

        {/* Loading indicator */}
        <div className="flex items-center gap-2">
          <Loader2Icon className={cn(
            "w-4 h-4 animate-spin",
            isDark ? "text-zinc-500" : "text-zinc-400"
          )} />
          <span className={cn(
            "text-xs uppercase tracking-wider",
            isDark ? "text-zinc-500" : "text-zinc-500"
          )}>
            Please wait while your server is being set up...
          </span>
        </div>

        {/* Progress hints */}
        <div className={cn(
          "mt-4 p-4 border text-xs space-y-1",
          isDark
            ? "bg-zinc-900/50 border-zinc-800 text-zinc-500"
            : "bg-zinc-50 border-zinc-200 text-zinc-500"
        )}>
          <p>This page will automatically update when installation is complete.</p>
          <p>Installation typically takes 1-5 minutes depending on the server type.</p>
        </div>
      </motion.div>
    </div>
  );
}
