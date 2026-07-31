import { useCallback, useMemo } from 'react';

export type UserAvatarSettings = {
  externalAvatarsEnabled: boolean;
};

export type UserAvatarSettingsController = {
  settings: UserAvatarSettings;
  setExternalAvatarsEnabled: (enabled: boolean) => void;
};

export const USER_AVATAR_SETTINGS_STORAGE_KEY = 'pulsete.preferences.userAvatars.v1';

const defaultUserAvatarSettings: UserAvatarSettings = {
  externalAvatarsEnabled: false,
};

export const parseUserAvatarSettings = (
  value: string | null | undefined,
): UserAvatarSettings => {
  if (!value) {
    return defaultUserAvatarSettings;
  }
  try {
    const parsed = JSON.parse(value) as Partial<UserAvatarSettings> | null;
    return {
      externalAvatarsEnabled: parsed?.externalAvatarsEnabled === true,
    };
  } catch {
    return defaultUserAvatarSettings;
  }
};

export const serializeUserAvatarSettings = (settings: UserAvatarSettings) =>
  JSON.stringify({
    externalAvatarsEnabled: settings.externalAvatarsEnabled === true,
  });

export function useUserAvatarSettings(
  settings: UserAvatarSettings,
  onSetExternalAvatarsEnabled: (enabled: boolean) => void,
): UserAvatarSettingsController {
  const setExternalAvatarsEnabled = useCallback((enabled: boolean) => {
    onSetExternalAvatarsEnabled(enabled);
  }, [onSetExternalAvatarsEnabled]);

  return useMemo(
    () => ({ settings, setExternalAvatarsEnabled }),
    [settings, setExternalAvatarsEnabled],
  );
}
