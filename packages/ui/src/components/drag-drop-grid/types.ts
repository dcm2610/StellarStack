import type { ReactNode, ComponentPropsWithoutRef } from "react";
import type { Layout, Layouts } from "react-grid-layout";

// Grid size configuration
export type GridSize = "xxs" | "xxs-wide" | "xs" | "sm" | "md" | "lg" | "xl" | "xxl";

export interface GridSizeConfig {
  w: number;
  h: number;
}

export interface GridItemConfig {
  i: string;
  size: GridSize;
  minSize?: GridSize;
  maxSize?: GridSize;
  allowedSizes?: GridSize[];
}

// Labels for remove confirmation dialog
export interface RemoveConfirmLabels {
  title: string;
  description: string;
  cancel: string;
  confirm: string;
}

// Context value type
export interface DragDropGridContextValue {
  cycleItemSize: (itemId: string) => void;
  getItemSize: (itemId: string) => GridSize;
  getItemMinSize: (itemId: string) => GridSize | undefined;
  getItemMaxSize: (itemId: string) => GridSize | undefined;
  canResize: (itemId: string) => boolean;
  removeItem: (itemId: string) => void;
  isEditing: boolean;
  removeConfirmLabels?: RemoveConfirmLabels;
}

// Main grid component props
export interface DragDropGridProps extends Omit<ComponentPropsWithoutRef<"div">, "children"> {
  children: ReactNode;
  items: GridItemConfig[];
  onLayoutChange?: (items: GridItemConfig[], layouts: Layouts) => void;
  onDropItem?: (itemId: string, layout: Layout) => void;
  onRemoveItem?: (itemId: string) => void;
  rowHeight?: number;
  gap?: number;
  isEditing?: boolean;
  savedLayouts?: Layouts;
  isDroppable?: boolean;
  allItems?: GridItemConfig[];
  removeConfirmLabels?: RemoveConfirmLabels;
}

// Grid item component props
export interface GridItemProps extends ComponentPropsWithoutRef<"div"> {
  itemId: string;
  children: ReactNode;
  showResizeHandle?: boolean;
  showDragHandle?: boolean;
  showRemoveHandle?: boolean;
}

// Re-export react-grid-layout types for convenience
export type { Layout, Layouts };
