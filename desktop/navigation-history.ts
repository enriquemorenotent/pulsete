export type DesktopNavigationHistory = {
  canGoBack: () => boolean;
  canGoForward: () => boolean;
  goBack: () => void;
  goForward: () => void;
};

export type DesktopNavigationEntries = DesktopNavigationHistory & {
  canGoToOffset: (offset: number) => boolean;
  getActiveIndex: () => number;
  getEntryAtIndex: (index: number) => { url: string } | null;
};

export const restrictDesktopNavigationToOrigin = (
  history: DesktopNavigationEntries,
  appUrl: string,
): DesktopNavigationHistory => ({
  canGoBack: () => canNavigateToOffset(history, -1, appUrl),
  canGoForward: () => canNavigateToOffset(history, 1, appUrl),
  goBack: history.goBack.bind(history),
  goForward: history.goForward.bind(history),
});

export const handleDesktopNavigationCommand = (
  command: string,
  history: DesktopNavigationHistory,
) => {
  if (command === 'browser-backward' && history.canGoBack()) {
    history.goBack();
    return true;
  }
  if (command === 'browser-forward' && history.canGoForward()) {
    history.goForward();
    return true;
  }
  return false;
};

const canNavigateToOffset = (
  history: DesktopNavigationEntries,
  offset: number,
  appUrl: string,
) => {
  if (!history.canGoToOffset(offset)) {
    return false;
  }
  const entry = history.getEntryAtIndex(history.getActiveIndex() + offset);
  try {
    return Boolean(entry && new URL(entry.url).origin === new URL(appUrl).origin);
  } catch {
    return false;
  }
};
