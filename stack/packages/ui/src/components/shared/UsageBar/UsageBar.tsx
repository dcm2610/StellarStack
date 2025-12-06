import { useMemo } from "react";
import { cn } from "@workspace/ui/lib/utils";

interface UsageBarProps {
  percentage?: number;
  segments?: number;
  isDark?: boolean;
}

const getGradientColors = (percentage: number, isDark: boolean): string => {
  if (percentage > 75) {
    // Red gradient
    return isDark
      ? "linear-gradient(to right, #450a0a, #ef4444)"
      : "linear-gradient(to right, #fecaca, #ef4444)";
  } else if (percentage > 50) {
    // Yellow/amber gradient
    return isDark
      ? "linear-gradient(to right, #451a03, #f59e0b)"
      : "linear-gradient(to right, #fef3c7, #f59e0b)";
  } else {
    // Green gradient
    return isDark
      ? "linear-gradient(to right, #052e16, #22c55e)"
      : "linear-gradient(to right, #dcfce7, #22c55e)";
  }
};

const UsageBar = ({ percentage: propPercentage, segments = 6, isDark = true }: UsageBarProps) => {
  // Use provided percentage or generate a random one
  const percentage = useMemo(() => {
    if (propPercentage !== undefined) return propPercentage;
    return Math.floor(Math.random() * 100);
  }, [propPercentage]);

  const gradient = getGradientColors(percentage, isDark);

  return (
    <div className="relative max-h-2 h-2 mt-auto">
      {/* Gray background */}
      <div className={cn("absolute inset-0 max-h-2", isDark ? "bg-zinc-700" : "bg-zinc-300")} />

      {/* Colored gradient overlay */}
      <div
        className="absolute top-0 left-0 h-full max-h-2 transition-all duration-300"
        style={{
          width: `${percentage}%`,
          background: gradient,
        }}
      />

      {/* Divider segments */}
      <div className="absolute inset-0 flex max-h-2">
        {Array.from({ length: segments - 1 }).map((_, i) => (
          <div key={i} className={cn("flex-1 border-r-4", isDark ? "border-zinc-900" : "border-white")} />
        ))}
        <div className="flex-1" />
      </div>
    </div>
  );
};

export default UsageBar;
