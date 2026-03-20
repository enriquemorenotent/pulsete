export const DEFAULT_SIDEBAR_WIDTH = 256;
export const MIN_SIDEBAR_WIDTH = 208;
export const MAX_SIDEBAR_WIDTH = 420;
export const SIDEBAR_WIDTH_STEP = 16;
export const SIDEBAR_WIDTH_STORAGE_KEY = 'pulsete.sidebar.width';

export const clampSidebarWidth = (value: number) =>
  Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, Math.round(value)));

export const readSidebarWidth = (storedValue: string | null) => {
  if (storedValue === null || storedValue.trim() === '') {
    return DEFAULT_SIDEBAR_WIDTH;
  }
  const parsed = Number(storedValue);
  return Number.isFinite(parsed) ? clampSidebarWidth(parsed) : DEFAULT_SIDEBAR_WIDTH;
};
