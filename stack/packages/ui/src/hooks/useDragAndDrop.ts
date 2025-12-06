import { useState, useCallback, useRef, type RefObject } from "react";

export interface DragState {
  isDragging: boolean;
  draggedItemId: string | null;
  draggedOverSlotId: string | null;
  startPosition: { x: number; y: number } | null;
  currentPosition: { x: number; y: number } | null;
}

export interface UseDragAndDropOptions {
  onDragStart?: (itemId: string) => void;
  onDragEnd?: (itemId: string, targetSlotId: string | null) => void;
  onDrop?: (itemId: string, fromSlotId: string, toSlotId: string) => void;
}

export interface UseDragAndDropReturn {
  dragState: DragState;
  handleDragStart: (e: React.MouseEvent | React.PointerEvent, itemId: string) => void;
  handleDragEnd: () => void;
  handleSlotDragOver: (slotId: string) => void;
  handleSlotDragLeave: () => void;
  createDragHandleProps: (itemId: string) => {
    onPointerDown: (e: React.PointerEvent) => void;
    style: React.CSSProperties;
  };
  getDraggedItemStyle: (itemId: string) => React.CSSProperties;
  isBeingDragged: (itemId: string) => boolean;
  isDraggedOver: (slotId: string) => boolean;
}

export function useDragAndDrop(
  options: UseDragAndDropOptions = {}
): UseDragAndDropReturn {
  const { onDragStart, onDragEnd, onDrop } = options;

  const [dragState, setDragState] = useState<DragState>({
    isDragging: false,
    draggedItemId: null,
    draggedOverSlotId: null,
    startPosition: null,
    currentPosition: null,
  });

  const dragCleanupRef = useRef<(() => void) | null>(null);

  const handleDragStart = useCallback(
    (e: React.MouseEvent | React.PointerEvent, itemId: string) => {
      e.preventDefault();
      e.stopPropagation();

      const startPos = { x: e.clientX, y: e.clientY };

      setDragState({
        isDragging: true,
        draggedItemId: itemId,
        draggedOverSlotId: null,
        startPosition: startPos,
        currentPosition: startPos,
      });

      onDragStart?.(itemId);

      const handlePointerMove = (moveEvent: PointerEvent) => {
        setDragState((prev) => ({
          ...prev,
          currentPosition: { x: moveEvent.clientX, y: moveEvent.clientY },
        }));
      };

      const handlePointerUp = () => {
        cleanup();
        setDragState((prev) => {
          onDragEnd?.(prev.draggedItemId!, prev.draggedOverSlotId);
          return {
            isDragging: false,
            draggedItemId: null,
            draggedOverSlotId: null,
            startPosition: null,
            currentPosition: null,
          };
        });
      };

      const cleanup = () => {
        document.removeEventListener("pointermove", handlePointerMove);
        document.removeEventListener("pointerup", handlePointerUp);
        document.body.style.userSelect = "";
        document.body.style.cursor = "";
        dragCleanupRef.current = null;
      };

      document.addEventListener("pointermove", handlePointerMove);
      document.addEventListener("pointerup", handlePointerUp);
      document.body.style.userSelect = "none";
      document.body.style.cursor = "grabbing";

      dragCleanupRef.current = cleanup;
    },
    [onDragStart, onDragEnd]
  );

  const handleDragEnd = useCallback(() => {
    if (dragCleanupRef.current) {
      dragCleanupRef.current();
    }
    setDragState({
      isDragging: false,
      draggedItemId: null,
      draggedOverSlotId: null,
      startPosition: null,
      currentPosition: null,
    });
  }, []);

  const handleSlotDragOver = useCallback((slotId: string) => {
    setDragState((prev) => ({
      ...prev,
      draggedOverSlotId: slotId,
    }));
  }, []);

  const handleSlotDragLeave = useCallback(() => {
    setDragState((prev) => ({
      ...prev,
      draggedOverSlotId: null,
    }));
  }, []);

  const createDragHandleProps = useCallback(
    (itemId: string) => ({
      onPointerDown: (e: React.PointerEvent) => handleDragStart(e, itemId),
      style: { cursor: "grab", touchAction: "none" } as React.CSSProperties,
    }),
    [handleDragStart]
  );

  const getDraggedItemStyle = useCallback(
    (itemId: string): React.CSSProperties => {
      if (dragState.draggedItemId !== itemId || !dragState.startPosition || !dragState.currentPosition) {
        return {};
      }

      const deltaX = dragState.currentPosition.x - dragState.startPosition.x;
      const deltaY = dragState.currentPosition.y - dragState.startPosition.y;

      return {
        position: "relative",
        zIndex: 1000,
        transform: `translate(${deltaX}px, ${deltaY}px)`,
        pointerEvents: "none",
        opacity: 0.9,
      };
    },
    [dragState]
  );

  const isBeingDragged = useCallback(
    (itemId: string) => dragState.draggedItemId === itemId,
    [dragState.draggedItemId]
  );

  const isDraggedOver = useCallback(
    (slotId: string) => dragState.draggedOverSlotId === slotId && dragState.isDragging,
    [dragState.draggedOverSlotId, dragState.isDragging]
  );

  return {
    dragState,
    handleDragStart,
    handleDragEnd,
    handleSlotDragOver,
    handleSlotDragLeave,
    createDragHandleProps,
    getDraggedItemStyle,
    isBeingDragged,
    isDraggedOver,
  };
}
