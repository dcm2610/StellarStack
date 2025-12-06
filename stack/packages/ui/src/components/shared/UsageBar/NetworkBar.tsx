import { cn } from "@workspace/ui/lib/utils";

interface NetworkBarProps {
  download: number; // percentage 0-100
  upload: number; // percentage 0-100
  segments?: number;
  compact?: boolean;
  isDark?: boolean;
}

const NetworkBar = ({ download, upload, segments = 6, compact = false, isDark = true }: NetworkBarProps) => {
  const downloadGradient = isDark
    ? "linear-gradient(to right, #1e3a5f, #3b82f6)"
    : "linear-gradient(to right, #dbeafe, #3b82f6)";
  const uploadGradient = isDark
    ? "linear-gradient(to right, #4c1d95, #a855f7)"
    : "linear-gradient(to right, #f3e8ff, #a855f7)";

  return (
    <div className={compact ? "space-y-1 mt-auto pt-2" : "space-y-2 mt-auto pt-4"}>
      {/* Download bar */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-zinc-500 w-4">↓</span>
        <div className="relative h-2 flex-1">
          {/* Gray background */}
          <div className={cn("absolute inset-0", isDark ? "bg-zinc-700" : "bg-zinc-300")} />

          {/* Blue gradient overlay for download */}
          <div
            className="absolute top-0 left-0 h-full transition-all duration-300"
            style={{
              width: `${download}%`,
              background: downloadGradient,
            }}
          />

          {/* Divider segments */}
          <div className="absolute inset-0 flex">
            {Array.from({ length: segments - 1 }).map((_, i) => (
              <div key={i} className={cn("flex-1 border-r-4", isDark ? "border-zinc-900" : "border-white")} />
            ))}
            <div className="flex-1" />
          </div>
        </div>
      </div>

      {/* Upload bar */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-zinc-500 w-4">↑</span>
        <div className="relative h-2 flex-1">
          {/* Gray background */}
          <div className={cn("absolute inset-0", isDark ? "bg-zinc-700" : "bg-zinc-300")} />

          {/* Purple gradient overlay for upload */}
          <div
            className="absolute top-0 left-0 h-full transition-all duration-300"
            style={{
              width: `${upload}%`,
              background: uploadGradient,
            }}
          />

          {/* Divider segments */}
          <div className="absolute inset-0 flex">
            {Array.from({ length: segments - 1 }).map((_, i) => (
              <div key={i} className={cn("flex-1 border-r-4", isDark ? "border-zinc-900" : "border-white")} />
            ))}
            <div className="flex-1" />
          </div>
        </div>
      </div>
    </div>
  );
};

export default NetworkBar;
