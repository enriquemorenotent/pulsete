export type UserAvatarSettings = {
  externalAvatarsEnabled: boolean;
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
