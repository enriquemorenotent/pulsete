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

const defaultMediaVisibilitySettings: MediaVisibilitySettings = {
  mode: 'show-media',
};

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
