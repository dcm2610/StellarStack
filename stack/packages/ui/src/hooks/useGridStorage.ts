import { useState, useEffect, useCallback, useRef } from "react";
import type { GridItemConfig, Layouts } from "../components/shared/DragDropGrid";

export interface GridStorageData {
  items: GridItemConfig[];
  layouts: Layouts;
  version: number;
}

export interface UseGridStorageOptions {
  key: string;
  defaultItems: GridItemConfig[];
  // Future: userId for syncing with backend
  // userId?: string;
}

const STORAGE_VERSION = 3;

/**
 * Hook for persisting grid layout to localStorage.
 * Designed to be extended for backend sync with user accounts.
 */
export function useGridStorage({ key, defaultItems }: UseGridStorageOptions) {
  // Use ref to avoid re-running effect when defaultItems reference changes
  const defaultItemsRef = useRef(defaultItems);
  defaultItemsRef.current = defaultItems;

  // Start with defaults to avoid hydration mismatch
  const [items, setItems] = useState<GridItemConfig[]>(defaultItems);
  const [layouts, setLayouts] = useState<Layouts | undefined>(undefined);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load from localStorage after mount (client-side only)
  useEffect(() => {
    try {
      const stored = localStorage.getItem(key);
      if (stored) {
        const data: GridStorageData = JSON.parse(stored);
        if (data.version === STORAGE_VERSION) {
          // Load items
          if (data.items) {
            const mergedItems = defaultItemsRef.current.map((defaultItem) => {
              const storedItem = data.items.find((i) => i.i === defaultItem.i);
              if (storedItem) {
                return { ...defaultItem, size: storedItem.size };
              }
              return defaultItem;
            });
            setItems(mergedItems);
          }
          // Load layouts
          if (data.layouts && Object.keys(data.layouts).length > 0) {
            setLayouts(data.layouts);
          }
        }
      }
    } catch (error) {
      console.warn("Failed to load grid layout from storage:", error);
    }
    setIsLoaded(true);
  }, [key]);

  // Save to localStorage
  const saveLayout = useCallback(
    (newItems: GridItemConfig[], newLayouts?: Layouts) => {
      console.log("[useGridStorage] saveLayout called with:", newItems, newLayouts);
      setItems(newItems);
      if (newLayouts) {
        setLayouts(newLayouts);
      }

      try {
        const data: GridStorageData = {
          items: newItems,
          layouts: newLayouts || ({} as Layouts),
          version: STORAGE_VERSION,
        };
        localStorage.setItem(key, JSON.stringify(data));
        console.log("[useGridStorage] Saved to localStorage:", key, data);
      } catch (error) {
        console.warn("Failed to save grid layout to storage:", error);
      }

      // Future: Sync with backend
      // if (userId) {
      //   syncToBackend(userId, data);
      // }
    },
    [key]
  );

  // Reset to defaults
  const resetLayout = useCallback(() => {
    setItems(defaultItemsRef.current);
    setLayouts(undefined);
    try {
      localStorage.removeItem(key);
    } catch (error) {
      console.warn("Failed to reset grid layout:", error);
    }
  }, [key]);

  return {
    items,
    layouts,
    isLoaded,
    saveLayout,
    resetLayout,
  };
}
