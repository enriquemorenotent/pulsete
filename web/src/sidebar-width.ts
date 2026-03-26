export const DEFAULT_SIDEBAR_WIDTH = 256;
export const MIN_SIDEBAR_WIDTH = 208;
export const MAX_SIDEBAR_WIDTH = 420;
export const SIDEBAR_WIDTH_STEP = 16;
export const SIDEBAR_WIDTH_STORAGE_KEY = 'pulsete.sidebar.width';
export const RIGHT_SIDEBAR_WIDTH_STORAGE_KEY = 'pulsete.sidebar.right.width';

export type SidebarEdge = 'left' | 'right';

export const clampSidebarWidth = (value: number) =>
  Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, Math.round(value)));

export const readSidebarWidth = (storedValue: string | null) => {
  if (storedValue === null || storedValue.trim() === '') {
    return DEFAULT_SIDEBAR_WIDTH;
  }
  const parsed = Number(storedValue);
  return Number.isFinite(parsed) ? clampSidebarWidth(parsed) : DEFAULT_SIDEBAR_WIDTH;
};

export const resolveDraggedSidebarWidth = (
  edge: SidebarEdge,
  clientX: number,
  bounds: Pick<DOMRect, 'left' | 'right'>,
) =>
  clampSidebarWidth(edge === 'left' ? clientX - bounds.left : bounds.right - clientX);

export const getSidebarResizeDeltaForKey = (
  edge: SidebarEdge,
  key: string,
) => {
  if (key === 'ArrowLeft') {
    return edge === 'left' ? -SIDEBAR_WIDTH_STEP : SIDEBAR_WIDTH_STEP;
  }
  if (key === 'ArrowRight') {
    return edge === 'left' ? SIDEBAR_WIDTH_STEP : -SIDEBAR_WIDTH_STEP;
  }
  return null;
};
