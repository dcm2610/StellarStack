import { useState, useEffect, useMemo } from "react";
import { useTheme } from "next-themes";
import { cn } from "@workspace/ui/lib/utils";

/**
 * Hook that encapsulates theme-related logic for admin pages.
 * Handles hydration issues and provides consistent styling classes.
 */
export function useAdminTheme() {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = mounted ? resolvedTheme === "dark" : true;

  // Consistent input styling across all admin pages
  const inputClasses = useMemo(
    () =>
      cn(
        "w-full px-3 py-2 border text-sm transition-colors focus:outline-none",
        isDark
          ? "bg-zinc-900 border-zinc-700 text-zinc-100 focus:border-zinc-500 placeholder:text-zinc-500"
          : "bg-white border-zinc-300 text-zinc-900 focus:border-zinc-400 placeholder:text-zinc-400"
      ),
    [isDark]
  );

  // Consistent label styling across all admin pages
  const labelClasses = useMemo(
    () =>
      cn(
        "block text-xs font-medium uppercase tracking-wider mb-1",
        isDark ? "text-zinc-400" : "text-zinc-600"
      ),
    [isDark]
  );

  // Consistent card styling
  const cardClasses = useMemo(
    () =>
      cn(
        "relative p-4 border transition-colors",
        isDark
          ? "bg-zinc-900/30 border-zinc-800 hover:border-zinc-700"
          : "bg-white border-zinc-200 hover:border-zinc-300"
      ),
    [isDark]
  );

  // Consistent search input styling
  const searchInputClasses = useMemo(
    () =>
      cn(
        "w-full pl-10 pr-4 py-2.5 text-sm border transition-colors focus:outline-none",
        isDark
          ? "bg-zinc-900/50 border-zinc-800 text-zinc-200 placeholder:text-zinc-500 focus:border-zinc-600"
          : "bg-white border-zinc-200 text-zinc-800 placeholder:text-zinc-400 focus:border-zinc-400"
      ),
    [isDark]
  );

  // Text area styling
  const textareaClasses = useMemo(
    () =>
      cn(
        "w-full px-3 py-2 border text-sm transition-colors focus:outline-none resize-none",
        isDark
          ? "bg-zinc-900 border-zinc-700 text-zinc-100 focus:border-zinc-500 placeholder:text-zinc-500"
          : "bg-white border-zinc-300 text-zinc-900 focus:border-zinc-400 placeholder:text-zinc-400"
      ),
    [isDark]
  );

  // Select styling
  const selectClasses = useMemo(
    () =>
      cn(
        "w-full px-3 py-2 border text-sm transition-colors focus:outline-none appearance-none cursor-pointer",
        isDark
          ? "bg-zinc-900 border-zinc-700 text-zinc-100 focus:border-zinc-500"
          : "bg-white border-zinc-300 text-zinc-900 focus:border-zinc-400"
      ),
    [isDark]
  );

  // Button variants
  const buttonClasses = useMemo(
    () => ({
      primary: cn(
        "px-4 py-2 text-sm font-medium transition-colors",
        isDark
          ? "bg-zinc-800 text-white hover:bg-zinc-700 border border-zinc-700"
          : "bg-zinc-900 text-white hover:bg-zinc-800"
      ),
      secondary: cn(
        "px-4 py-2 text-sm font-medium transition-colors border",
        isDark
          ? "bg-transparent text-zinc-300 border-zinc-700 hover:bg-zinc-800"
          : "bg-transparent text-zinc-700 border-zinc-300 hover:bg-zinc-100"
      ),
      danger: cn(
        "px-4 py-2 text-sm font-medium transition-colors",
        isDark
          ? "bg-red-900/30 text-red-400 border border-red-900/50 hover:bg-red-900/50"
          : "bg-red-50 text-red-600 border border-red-200 hover:bg-red-100"
      ),
    }),
    [isDark]
  );

  return {
    mounted,
    isDark,
    inputClasses,
    labelClasses,
    cardClasses,
    searchInputClasses,
    textareaClasses,
    selectClasses,
    buttonClasses,
  };
}

/**
 * Corner accent decorations for cards and modals
 */
export function CornerAccents({
  isDark,
  size = "sm",
  color = "zinc",
}: {
  isDark: boolean;
  size?: "sm" | "lg";
  color?: "zinc" | "blue";
}) {
  const sizeClass = size === "sm" ? "w-2 h-2" : "w-3 h-3";
  const colorClass =
    color === "blue"
      ? isDark
        ? "border-blue-600"
        : "border-blue-400"
      : isDark
        ? "border-zinc-500"
        : "border-zinc-400";

  return (
    <>
      <div className={cn("absolute top-0 left-0 border-t border-l", sizeClass, colorClass)} />
      <div className={cn("absolute top-0 right-0 border-t border-r", sizeClass, colorClass)} />
      <div className={cn("absolute bottom-0 left-0 border-b border-l", sizeClass, colorClass)} />
      <div className={cn("absolute bottom-0 right-0 border-b border-r", sizeClass, colorClass)} />
    </>
  );
}
