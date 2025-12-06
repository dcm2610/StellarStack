import { useEffect, useRef, useCallback, useState } from "react";
import { createSwapy, type Swapy, type SlotItemMap } from "swapy";

export type SwapyAnimation = "dynamic" | "spring" | "none";

export interface UseSwapyOptions {
  animation?: SwapyAnimation;
  enabled?: boolean;
  swapMode?: "hover" | "drop";
  autoScrollOnDrag?: boolean;
  dragOnHold?: boolean;
  onSwap?: (slotItemMap: SlotItemMap) => void;
  onSwapStart?: () => void;
  onSwapEnd?: () => void;
}

export interface UseSwapyReturn<T extends HTMLElement> {
  containerRef: React.RefObject<T | null>;
  swapy: Swapy | null;
  slotItemMap: SlotItemMap;
  enable: () => void;
  disable: () => void;
  update: () => void;
}

export function useSwapy<T extends HTMLElement = HTMLDivElement>(
  options: UseSwapyOptions = {}
): UseSwapyReturn<T> {
  const {
    animation = "dynamic",
    enabled = true,
    swapMode = "hover",
    autoScrollOnDrag = true,
    dragOnHold = false,
    onSwap,
    onSwapStart,
    onSwapEnd,
  } = options;

  const containerRef = useRef<T | null>(null);
  const swapyRef = useRef<Swapy | null>(null);
  const [slotItemMap, setSlotItemMap] = useState<SlotItemMap>({
    asArray: [],
    asObject: {},
    asMap: new Map(),
  });

  useEffect(() => {
    if (!containerRef.current) return;

    const swapy = createSwapy(containerRef.current, {
      animation,
      enabled,
      swapMode,
      autoScrollOnDrag,
      dragOnHold,
    });

    swapyRef.current = swapy;

    swapy.onSwap((event) => {
      setSlotItemMap(event.newSlotItemMap);
      onSwap?.(event.newSlotItemMap);
    });

    swapy.onSwapStart(() => {
      onSwapStart?.();
    });

    swapy.onSwapEnd(() => {
      onSwapEnd?.();
    });

    return () => {
      swapy.destroy();
      swapyRef.current = null;
    };
  }, [animation, swapMode, autoScrollOnDrag, dragOnHold]);

  useEffect(() => {
    if (swapyRef.current) {
      swapyRef.current.enable(enabled);
    }
  }, [enabled]);

  const enable = useCallback(() => {
    swapyRef.current?.enable(true);
  }, []);

  const disable = useCallback(() => {
    swapyRef.current?.enable(false);
  }, []);

  const update = useCallback(() => {
    swapyRef.current?.update();
  }, []);

  return {
    containerRef,
    swapy: swapyRef.current,
    slotItemMap,
    enable,
    disable,
    update,
  };
}
