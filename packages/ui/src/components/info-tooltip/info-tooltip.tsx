"use client";

import { FiInfo } from "react-icons/fi";
import { cn } from "@workspace/ui/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip";

interface InfoTooltipProps {
  content: React.ReactNode;
  className?: string;
  visible?: boolean;
}

export const InfoTooltip = ({ content, className, visible = true }: InfoTooltipProps) => {
  if (!visible) return null;

  return (
    <div className={cn("absolute top-4 right-4 z-10", className)}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className={cn(
              "p-1.5 rounded-full transition-colors",
              "bg-zinc-800/60 hover:bg-zinc-700/80"
            )}
          >
            <FiInfo className={cn("w-3.5 h-3.5", "text-zinc-400")} />
          </button>
        </TooltipTrigger>
        <TooltipContent
          side="bottom"
          align="end"
          sideOffset={8}
          className={cn(
            "relative p-4 border min-w-[220px] max-w-[300px] rounded-none backdrop-blur-md",
            "bg-[#0f0f0f]/80 border-zinc-200/10"
          )}
        >
          {/* Corner accents matching UsageCard */}
          <div className={cn("absolute top-0 left-0 w-2 h-2 border-t border-l", "border-zinc-500")} />
          <div className={cn("absolute top-0 right-0 w-2 h-2 border-t border-r", "border-zinc-500")} />
          <div className={cn("absolute bottom-0 left-0 w-2 h-2 border-b border-l", "border-zinc-500")} />
          <div className={cn("absolute bottom-0 right-0 w-2 h-2 border-b border-r", "border-zinc-500")} />

          <div className={cn("text-xs space-y-2", "text-zinc-300")}>
            {content}
          </div>
        </TooltipContent>
      </Tooltip>
    </div>
  );
};

interface InfoRowProps {
  label: string;
  value: string;
}

export const InfoRow = ({ label, value }: InfoRowProps) => {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-zinc-500">{label}</span>
      <span className={cn("font-mono text-right", "text-zinc-200")}>{value}</span>
    </div>
  );
};
