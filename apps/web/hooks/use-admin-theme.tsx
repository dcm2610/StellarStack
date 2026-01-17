import { useMemo } from "react";
import { cn } from "@workspace/ui/lib/utils";

/**
 * Hook that encapsulates theme-related logic for admin pages.
 * Handles hydration issues and provides consistent styling classes.
 */
export const useAdminTheme = () => {
  // Consistent input styling across all admin pages
  const inputClasses = useMemo(
    () =>
      cn(
        "w-full px-3 py-2 border text-sm transition-colors focus:outline-none bg-zinc-900 border-zinc-700 text-zinc-100 focus:border-zinc-500 placeholder:text-zinc-500"
      ),
    []
  );

  // Consistent label styling across all admin pages
  const labelClasses = useMemo(
    () =>
      cn(
        "block text-xs font-medium uppercase tracking-wider mb-1 text-zinc-400"
      ),
    []
  );

  // Consistent card styling
  const cardClasses = useMemo(
    () =>
      cn(
        "relative p-4 border transition-colors bg-zinc-900/30 border-zinc-800 hover:border-zinc-700"
      ),
    []
  );

  // Consistent search input styling
  const searchInputClasses = useMemo(
    () =>
      cn(
        "w-full pl-10 pr-4 py-2.5 text-sm border transition-colors focus:outline-none bg-zinc-900/50 border-zinc-800 text-zinc-200 placeholder:text-zinc-500 focus:border-zinc-600"
      ),
    []
  );

  // Text area styling
  const textareaClasses = useMemo(
    () =>
      cn(
        "w-full px-3 py-2 border text-sm transition-colors focus:outline-none resize-none bg-zinc-900 border-zinc-700 text-zinc-100 focus:border-zinc-500 placeholder:text-zinc-500"
      ),
    []
  );

  // Select styling
  const selectClasses = useMemo(
    () =>
      cn(
        "w-full px-3 py-2 border text-sm transition-colors focus:outline-none appearance-none cursor-pointer bg-zinc-900 border-zinc-700 text-zinc-100 focus:border-zinc-500"
      ),
    []
  );

  // Button variants
  const buttonClasses = useMemo(
    () => ({
      primary: cn(
        "px-4 py-2 text-sm font-medium transition-colors bg-zinc-800 text-white hover:bg-zinc-700 border border-zinc-700"
      ),
      secondary: cn(
        "px-4 py-2 text-sm font-medium transition-colors border bg-transparent text-zinc-300 border-zinc-700 hover:bg-zinc-800"
      ),
      danger: cn(
        "px-4 py-2 text-sm font-medium transition-colors bg-red-900/30 text-red-400 border border-red-900/50 hover:bg-red-900/50"
      ),
    }),
    []
  );

  return {
    mounted: true,
    inputClasses,
    labelClasses,
    cardClasses,
    searchInputClasses,
    textareaClasses,
    selectClasses,
    buttonClasses,
  };
};

/**
 * Corner accent decorations for cards and modals
 */
export const CornerAccents = ({
  size = "sm",
  color = "zinc",
}: {
  size?: "sm" | "lg";
  color?: "zinc" | "blue";
}) => {
  const sizeClass = size === "sm" ? "w-2 h-2" : "w-3 h-3";
  const colorClass = color === "blue" ? "border-blue-600" : "border-zinc-500";

  return (
    <>
      <div className={cn("absolute top-0 left-0 border-t border-l", sizeClass, colorClass)} />
      <div className={cn("absolute top-0 right-0 border-t border-r", sizeClass, colorClass)} />
      <div className={cn("absolute bottom-0 left-0 border-b border-l", sizeClass, colorClass)} />
      <div className={cn("absolute bottom-0 right-0 border-b border-r", sizeClass, colorClass)} />
    </>
  );
};
