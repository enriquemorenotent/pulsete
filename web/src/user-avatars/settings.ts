import { useCallback, useEffect, useState } from 'react';

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

const readStoredUserAvatarSettings = (): UserAvatarSettings => {
  if (typeof window === 'undefined') {
    return defaultUserAvatarSettings;
  }
  try {
    return parseUserAvatarSettings(
      window.localStorage.getItem(USER_AVATAR_SETTINGS_STORAGE_KEY),
    );
  } catch {
    return defaultUserAvatarSettings;
  }
};

export function useUserAvatarSettings(): UserAvatarSettingsController {
  const [settings, setSettings] = useState(readStoredUserAvatarSettings);
  const setExternalAvatarsEnabled = useCallback((enabled: boolean) => {
    setSettings({ externalAvatarsEnabled: enabled });
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    try {
      window.localStorage.setItem(
        USER_AVATAR_SETTINGS_STORAGE_KEY,
        serializeUserAvatarSettings(settings),
      );
    } catch {
      // localStorage may be unavailable in private or embedded contexts.
    }
  }, [settings]);

  return {
    settings,
    setExternalAvatarsEnabled,
  };
}
