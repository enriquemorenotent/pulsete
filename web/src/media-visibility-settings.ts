import { useCallback, useEffect, useMemo, useState } from 'react';

export const MEDIA_VISIBILITY_SETTINGS_STORAGE_KEY =
  'pulsete.preferences.mediaVisibility.v1';

export const MEDIA_VISIBILITY_MODES = [
  'show-media',
  'hide-media',
] as const;

export type MediaVisibilityMode = typeof MEDIA_VISIBILITY_MODES[number];

export type MediaVisibilitySettings = {
  mode: MediaVisibilityMode;
};

export type MediaVisibilitySettingsController = {
  settings: MediaVisibilitySettings;
  setMode: (mode: MediaVisibilityMode) => void;
};

export type MediaVisibilityPolicy = {
  mode: MediaVisibilityMode;
  showChatImagePreviews: boolean;
  showCommandPaletteImages: boolean;
  showExternalMedia: boolean;
  showNotificationIcons: boolean;
  showProfileImages: boolean;
  showServerImages: boolean;
  showUserAvatars: boolean;
};

const defaultMediaVisibilitySettings: MediaVisibilitySettings = {
  mode: 'show-media',
};

export const defaultMediaVisibilityPolicy = resolveMediaVisibilityPolicy(
  defaultMediaVisibilitySettings,
);

const isMediaVisibilityMode = (value: unknown): value is MediaVisibilityMode =>
  typeof value === 'string'
  && MEDIA_VISIBILITY_MODES.includes(value as MediaVisibilityMode);

export const parseMediaVisibilitySettings = (
  value: string | null | undefined,
): MediaVisibilitySettings => {
  if (!value) {
    return defaultMediaVisibilitySettings;
  }
  try {
    const parsed = JSON.parse(value) as Partial<MediaVisibilitySettings> | null;
    return {
      mode: isMediaVisibilityMode(parsed?.mode)
        ? parsed.mode
        : defaultMediaVisibilitySettings.mode,
    };
  } catch {
    return defaultMediaVisibilitySettings;
  }
};

export const serializeMediaVisibilitySettings = (
  settings: MediaVisibilitySettings,
) => JSON.stringify({
  mode: isMediaVisibilityMode(settings.mode)
    ? settings.mode
    : defaultMediaVisibilitySettings.mode,
});

export function resolveMediaVisibilityPolicy(
  settings: MediaVisibilitySettings,
): MediaVisibilityPolicy {
  const showMedia = settings.mode === 'show-media';
  return {
    mode: settings.mode,
    showChatImagePreviews: showMedia,
    showCommandPaletteImages: showMedia,
    showExternalMedia: showMedia,
    showNotificationIcons: showMedia,
    showProfileImages: showMedia,
    showServerImages: showMedia,
    showUserAvatars: showMedia,
  };
}

const readStoredMediaVisibilitySettings = (): MediaVisibilitySettings => {
  if (typeof window === 'undefined') {
    return defaultMediaVisibilitySettings;
  }
  try {
    return parseMediaVisibilitySettings(
      window.localStorage.getItem(MEDIA_VISIBILITY_SETTINGS_STORAGE_KEY),
    );
  } catch {
    return defaultMediaVisibilitySettings;
  }
};

export function useMediaVisibilitySettings(): MediaVisibilitySettingsController {
  const [settings, setSettings] = useState(readStoredMediaVisibilitySettings);
  const setMode = useCallback((mode: MediaVisibilityMode) => {
    setSettings({ mode });
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    try {
      window.localStorage.setItem(
        MEDIA_VISIBILITY_SETTINGS_STORAGE_KEY,
        serializeMediaVisibilitySettings(settings),
      );
    } catch {
      // localStorage may be unavailable in private or embedded contexts.
    }
  }, [settings]);

  return useMemo(() => ({ settings, setMode }), [settings, setMode]);
}
