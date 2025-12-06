import { useState, useCallback } from "react";

export type GridSize = "sm" | "md" | "lg" | "xl";

export interface GridItem {
  id: string;
  slotId: string;
  size: GridSize;
}

export interface GridSlot {
  id: string;
  itemId: string | null;
}

export interface UseGridLayoutOptions {
  initialItems?: GridItem[];
  totalSlots?: number;
  onLayoutChange?: (items: GridItem[]) => void;
}

export interface UseGridLayoutReturn {
  items: GridItem[];
  slots: GridSlot[];
  getItemInSlot: (slotId: string) => GridItem | null;
  getSlotForItem: (itemId: string) => string | null;
  getItemSize: (itemId: string) => GridSize;
  setItemSize: (itemId: string, size: GridSize) => void;
  cycleItemSize: (itemId: string) => void;
  moveItem: (itemId: string, toSlotId: string) => void;
  swapItems: (slotA: string, slotB: string) => void;
  isSlotEmpty: (slotId: string) => boolean;
}

const SIZE_ORDER: GridSize[] = ["sm", "md", "lg", "xl"];
const DEFAULT_SIZE: GridSize = "md";

export const gridSizeConfig: Record<
  GridSize,
  { colSpan: number; rowSpan: number }
> = {
  sm: { colSpan: 3, rowSpan: 1 },
  md: { colSpan: 6, rowSpan: 1 },
  lg: { colSpan: 6, rowSpan: 2 },
  xl: { colSpan: 12, rowSpan: 2 },
};

export function useGridLayout(
  options: UseGridLayoutOptions = {}
): UseGridLayoutReturn {
  const { initialItems = [], totalSlots = 9, onLayoutChange } = options;

  const [items, setItems] = useState<GridItem[]>(initialItems);

  // Generate slots based on totalSlots
  const slots: GridSlot[] = Array.from({ length: totalSlots }, (_, i) => {
    const slotId = `slot-${i + 1}`;
    const item = items.find((item) => item.slotId === slotId);
    return {
      id: slotId,
      itemId: item?.id ?? null,
    };
  });

  const getItemInSlot = useCallback(
    (slotId: string): GridItem | null => {
      return items.find((item) => item.slotId === slotId) ?? null;
    },
    [items]
  );

  const getSlotForItem = useCallback(
    (itemId: string): string | null => {
      return items.find((item) => item.id === itemId)?.slotId ?? null;
    },
    [items]
  );

  const getItemSize = useCallback(
    (itemId: string): GridSize => {
      return items.find((item) => item.id === itemId)?.size ?? DEFAULT_SIZE;
    },
    [items]
  );

  const setItemSize = useCallback(
    (itemId: string, size: GridSize) => {
      setItems((prev) => {
        const newItems = prev.map((item) =>
          item.id === itemId ? { ...item, size } : item
        );
        onLayoutChange?.(newItems);
        return newItems;
      });
    },
    [onLayoutChange]
  );

  const cycleItemSize = useCallback(
    (itemId: string) => {
      setItems((prev) => {
        const item = prev.find((i) => i.id === itemId);
        if (!item) return prev;

        const currentIndex = SIZE_ORDER.indexOf(item.size);
        const nextIndex = (currentIndex + 1) % SIZE_ORDER.length;
        const nextSize = SIZE_ORDER[nextIndex];

        const newItems = prev.map((i) =>
          i.id === itemId ? { ...i, size: nextSize } : i
        );
        onLayoutChange?.(newItems);
        return newItems;
      });
    },
    [onLayoutChange]
  );

  const moveItem = useCallback(
    (itemId: string, toSlotId: string) => {
      setItems((prev) => {
        // Check if target slot is occupied
        const targetItem = prev.find((item) => item.slotId === toSlotId);
        const movingItem = prev.find((item) => item.id === itemId);

        if (!movingItem) return prev;

        let newItems: GridItem[];

        if (targetItem) {
          // Swap the items
          newItems = prev.map((item) => {
            if (item.id === itemId) {
              return { ...item, slotId: toSlotId };
            }
            if (item.id === targetItem.id) {
              return { ...item, slotId: movingItem.slotId };
            }
            return item;
          });
        } else {
          // Just move to empty slot
          newItems = prev.map((item) =>
            item.id === itemId ? { ...item, slotId: toSlotId } : item
          );
        }

        onLayoutChange?.(newItems);
        return newItems;
      });
    },
    [onLayoutChange]
  );

  const swapItems = useCallback(
    (slotA: string, slotB: string) => {
      setItems((prev) => {
        const itemA = prev.find((item) => item.slotId === slotA);
        const itemB = prev.find((item) => item.slotId === slotB);

        if (!itemA && !itemB) return prev;

        const newItems = prev.map((item) => {
          if (item.slotId === slotA) {
            return { ...item, slotId: slotB };
          }
          if (item.slotId === slotB) {
            return { ...item, slotId: slotA };
          }
          return item;
        });

        onLayoutChange?.(newItems);
        return newItems;
      });
    },
    [onLayoutChange]
  );

  const isSlotEmpty = useCallback(
    (slotId: string): boolean => {
      return !items.some((item) => item.slotId === slotId);
    },
    [items]
  );

  return {
    items,
    slots,
    getItemInSlot,
    getSlotForItem,
    getItemSize,
    setItemSize,
    cycleItemSize,
    moveItem,
    swapItems,
    isSlotEmpty,
  };
}
