"use client";

import { cn } from "@workspace/ui/lib/utils";
import type { GradientTextProps, ShimmerTextProps } from "../animations-types";

export type { GradientTextProps, ShimmerTextProps };

export const GradientText = ({
  children,
  className,
  gradient = "from-blue-400 via-purple-400 to-pink-400",
  animated = false,
}: GradientTextProps) => {
  return (
    <span
      className={cn(
        "bg-clip-text text-transparent bg-gradient-to-r",
        gradient,
        animated && "animate-gradient bg-[length:200%_auto]",
        className
      )}
    >
      {children}
      {animated && (
        <style jsx>{`
          @keyframes gradient {
            0% {
              background-position: 0% center;
            }
            50% {
              background-position: 100% center;
            }
            100% {
              background-position: 0% center;
            }
          }
          .animate-gradient {
            animation: gradient 3s ease infinite;
          }
        `}</style>
      )}
    </span>
  );
};

// Shimmer text effect
export const ShimmerText = ({
  children,
  className,
}: ShimmerTextProps) => {
  return (
    <span className={cn("relative inline-block", className)}>
      <span className="relative z-10">{children}</span>
      <span
        className={cn(
          "absolute inset-0 z-20 bg-gradient-to-r from-transparent via-white/20 to-transparent",
          "animate-shimmer bg-[length:200%_100%]"
        )}
        style={{
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          backgroundClip: "text",
        }}
      />
      <style jsx>{`
        @keyframes shimmer {
          0% {
            background-position: -200% center;
          }
          100% {
            background-position: 200% center;
          }
        }
        .animate-shimmer {
          animation: shimmer 3s ease-in-out infinite;
        }
      `}</style>
    </span>
  );
};
