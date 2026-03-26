import { useEffect, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import {
  DEFAULT_SIDEBAR_WIDTH,
  clampSidebarWidth,
  readSidebarWidth,
  resolveDraggedSidebarWidth,
  type SidebarEdge,
  SIDEBAR_WIDTH_STORAGE_KEY,
} from './sidebar-width.js';

type UseSidebarResizeOptions = {
  edge?: SidebarEdge;
  storageKey?: string;
};

export function useSidebarResize(
  layoutRef: RefObject<HTMLElement | null>,
  options: UseSidebarResizeOptions = {},
) {
  const edge = options.edge ?? 'left';
  const storageKey = options.storageKey ?? SIDEBAR_WIDTH_STORAGE_KEY;
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    if (typeof window === 'undefined') {
      return DEFAULT_SIDEBAR_WIDTH;
    }
    return readSidebarWidth(window.localStorage.getItem(storageKey));
  });
  const [isResizing, setIsResizing] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(storageKey, String(sidebarWidth));
  }, [sidebarWidth, storageKey]);

  useEffect(() => {
    if (!isResizing) {
      return;
    }

    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const stopDragging = () => {
      setIsResizing(false);
    };

    const handlePointerMove = (event: PointerEvent) => {
      const layout = layoutRef.current;
      if (!layout) {
        return;
      }
      const bounds = layout.getBoundingClientRect();
      setSidebarWidth(resolveDraggedSidebarWidth(edge, event.clientX, bounds));
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopDragging);
    window.addEventListener('pointercancel', stopDragging);

    return () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stopDragging);
      window.removeEventListener('pointercancel', stopDragging);
    };
  }, [edge, isResizing, layoutRef]);

  const startDragging = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    setIsResizing(true);
  };

  const nudgeWidth = (delta: number) => {
    setSidebarWidth((currentWidth) => clampSidebarWidth(currentWidth + delta));
  };

  const resetWidth = () => {
    setSidebarWidth(DEFAULT_SIDEBAR_WIDTH);
  };

  return {
    sidebarWidth,
    isResizing,
    startDragging,
    nudgeWidth,
    resetWidth,
  };
}
