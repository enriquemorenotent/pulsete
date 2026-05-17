import { useCallback, useEffect, useState } from 'react';

export const NAVIGATION_LAYOUT_SETTINGS_STORAGE_KEY =
  'pulsete.preferences.navigationLayout.v1';

export const NAVIGATION_LAYOUT_MODES = [
  'all-servers-visible',
  'server-rail',
] as const;

export type NavigationLayoutMode = typeof NAVIGATION_LAYOUT_MODES[number];

export type NavigationLayoutSettings = {
  mode: NavigationLayoutMode;
};

export type NavigationLayoutSettingsController = {
  settings: NavigationLayoutSettings;
  setMode: (mode: NavigationLayoutMode) => void;
};

const defaultNavigationLayoutSettings: NavigationLayoutSettings = {
  mode: 'all-servers-visible',
};

const isNavigationLayoutMode = (value: unknown): value is NavigationLayoutMode =>
  typeof value === 'string'
  && NAVIGATION_LAYOUT_MODES.includes(value as NavigationLayoutMode);

export const parseNavigationLayoutSettings = (
  value: string | null | undefined,
): NavigationLayoutSettings => {
  if (!value) {
    return defaultNavigationLayoutSettings;
  }
  try {
    const parsed = JSON.parse(value) as Partial<NavigationLayoutSettings> | null;
    return {
      mode: isNavigationLayoutMode(parsed?.mode)
        ? parsed.mode
        : defaultNavigationLayoutSettings.mode,
    };
  } catch {
    return defaultNavigationLayoutSettings;
  }
};

export const serializeNavigationLayoutSettings = (
  settings: NavigationLayoutSettings,
) => JSON.stringify({
  mode: isNavigationLayoutMode(settings.mode)
    ? settings.mode
    : defaultNavigationLayoutSettings.mode,
});

const readStoredNavigationLayoutSettings = (): NavigationLayoutSettings => {
  if (typeof window === 'undefined') {
    return defaultNavigationLayoutSettings;
  }
  try {
    return parseNavigationLayoutSettings(
      window.localStorage.getItem(NAVIGATION_LAYOUT_SETTINGS_STORAGE_KEY),
    );
  } catch {
    return defaultNavigationLayoutSettings;
  }
};

export function useNavigationLayoutSettings(): NavigationLayoutSettingsController {
  const [settings, setSettings] = useState(readStoredNavigationLayoutSettings);
  const setMode = useCallback((mode: NavigationLayoutMode) => {
    setSettings({ mode });
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    try {
      window.localStorage.setItem(
        NAVIGATION_LAYOUT_SETTINGS_STORAGE_KEY,
        serializeNavigationLayoutSettings(settings),
      );
    } catch {
      // localStorage may be unavailable in private or embedded contexts.
    }
  }, [settings]);

  return {
    settings,
    setMode,
  };
}
