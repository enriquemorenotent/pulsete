import { useEffect, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import {
  DEFAULT_SIDEBAR_WIDTH,
  SIDEBAR_WIDTH_STORAGE_KEY,
  clampSidebarWidth,
  readSidebarWidth,
} from './sidebar-width.js';

export function useSidebarResize(layoutRef: RefObject<HTMLElement | null>) {
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    if (typeof window === 'undefined') {
      return DEFAULT_SIDEBAR_WIDTH;
    }
    return readSidebarWidth(window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY));
  });
  const [isResizing, setIsResizing] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(sidebarWidth));
  }, [sidebarWidth]);

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
      setSidebarWidth(clampSidebarWidth(event.clientX - bounds.left));
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
  }, [isResizing, layoutRef]);

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
