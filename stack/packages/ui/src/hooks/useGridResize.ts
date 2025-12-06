import { useState, useCallback } from "react";

export type GridSize = "sm" | "md" | "lg" | "xl";

export interface GridItemSize {
  id: string;
  size: GridSize;
}

export interface UseGridResizeOptions {
  initialSizes?: Record<string, GridSize>;
  onResize?: (id: string, size: GridSize) => void;
}

export interface UseGridResizeReturn {
  sizes: Record<string, GridSize>;
  getSize: (id: string) => GridSize;
  setSize: (id: string, size: GridSize) => void;
  cycleSize: (id: string) => void;
  resetSize: (id: string) => void;
  resetAll: () => void;
}

const SIZE_ORDER: GridSize[] = ["sm", "md", "lg", "xl"];
const DEFAULT_SIZE: GridSize = "md";

export function useGridResize(
  options: UseGridResizeOptions = {}
): UseGridResizeReturn {
  const { initialSizes = {}, onResize } = options;

  const [sizes, setSizes] = useState<Record<string, GridSize>>(initialSizes);

  const getSize = useCallback(
    (id: string): GridSize => {
      return sizes[id] ?? DEFAULT_SIZE;
    },
    [sizes]
  );

  const setSize = useCallback(
    (id: string, size: GridSize) => {
      setSizes((prev) => ({
        ...prev,
        [id]: size,
      }));
      onResize?.(id, size);
    },
    [onResize]
  );

  const cycleSize = useCallback(
    (id: string) => {
      const currentSize = sizes[id] ?? DEFAULT_SIZE;
      const currentIndex = SIZE_ORDER.indexOf(currentSize);
      const nextIndex = (currentIndex + 1) % SIZE_ORDER.length;
      const nextSize = SIZE_ORDER[nextIndex];
      setSize(id, nextSize);
    },
    [sizes, setSize]
  );

  const resetSize = useCallback(
    (id: string) => {
      const initialSize = initialSizes[id] ?? DEFAULT_SIZE;
      setSize(id, initialSize);
    },
    [initialSizes, setSize]
  );

  const resetAll = useCallback(() => {
    setSizes(initialSizes);
  }, [initialSizes]);

  return {
    sizes,
    getSize,
    setSize,
    cycleSize,
    resetSize,
    resetAll,
  };
}

// Grid size to CSS class mappings for a 12-column grid
export const gridSizeConfig: Record<
  GridSize,
  { colSpan: number; rowSpan: number; className: string }
> = {
  sm: { colSpan: 3, rowSpan: 1, className: "col-span-3 row-span-1" },
  md: { colSpan: 6, rowSpan: 1, className: "col-span-6 row-span-1" },
  lg: { colSpan: 6, rowSpan: 2, className: "col-span-6 row-span-2" },
  xl: { colSpan: 12, rowSpan: 2, className: "col-span-12 row-span-2" },
};
