import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import {
  DEFAULT_SIDEBAR_WIDTH,
  clampSidebarWidth,
  readSidebarWidth,
  resolveDraggedSidebarWidth,
  type SidebarEdge,
} from './sidebar-width.js';

type UseSidebarResizeOptions = {
  edge?: SidebarEdge;
  width?: number;
  onCommit?: (width: number) => void;
};

export function useSidebarResize(
  layoutRef: RefObject<HTMLElement | null>,
  options: UseSidebarResizeOptions = {},
) {
  const edge = options.edge ?? 'left';
  const [sidebarWidth, setSidebarWidth] = useState(() =>
    readSidebarWidth(String(options.width ?? DEFAULT_SIDEBAR_WIDTH))
  );
  const [isResizing, setIsResizing] = useState(false);
  const widthRef = useRef(sidebarWidth);
  const externalWidthRef = useRef(options.width);
  const pendingExternalWidthRef = useRef<number | null>(null);
  widthRef.current = sidebarWidth;

  useEffect(() => {
    if (options.width !== externalWidthRef.current) {
      externalWidthRef.current = options.width;
      pendingExternalWidthRef.current = options.width === undefined
        ? null
        : clampSidebarWidth(options.width);
    }
    if (!isResizing && pendingExternalWidthRef.current !== null) {
      const next = pendingExternalWidthRef.current;
      pendingExternalWidthRef.current = null;
      widthRef.current = next;
      setSidebarWidth(next);
    }
  }, [isResizing, options.width]);

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
      options.onCommit?.(widthRef.current);
    };

    const handlePointerMove = (event: PointerEvent) => {
      const layout = layoutRef.current;
      if (!layout) {
        return;
      }
      const bounds = layout.getBoundingClientRect();
      const next = resolveDraggedSidebarWidth(edge, event.clientX, bounds);
      widthRef.current = next;
      setSidebarWidth(next);
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
  }, [edge, isResizing, layoutRef, options.onCommit]);

  const startDragging = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    setIsResizing(true);
  };

  const nudgeWidth = (delta: number) => {
    const next = clampSidebarWidth(widthRef.current + delta);
    widthRef.current = next;
    setSidebarWidth(next);
    options.onCommit?.(next);
  };

  const resetWidth = () => {
    widthRef.current = DEFAULT_SIDEBAR_WIDTH;
    setSidebarWidth(DEFAULT_SIDEBAR_WIDTH);
    options.onCommit?.(DEFAULT_SIDEBAR_WIDTH);
  };

  return {
    sidebarWidth,
    isResizing,
    startDragging,
    nudgeWidth,
    resetWidth,
  };
}
