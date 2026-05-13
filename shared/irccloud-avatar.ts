import type { UserIdentitySource } from './user-identity.js';

export const ircCloudAvatarIdValuePattern = /^[1-9][0-9]*$/;

const ircCloudAvatarIdPattern = /(?:^|[^a-z0-9])(?:uid|sid)([1-9][0-9]*)(?=$|[^a-z0-9])/i;

export const normalizeIrcCloudAvatarId = (value: string | null | undefined) => {
  const trimmed = value?.trim() ?? '';
  return ircCloudAvatarIdValuePattern.test(trimmed) ? trimmed : null;
};

export const extractIrcCloudAvatarId = (value: string | null | undefined) => {
  const match = value?.match(ircCloudAvatarIdPattern);
  return normalizeIrcCloudAvatarId(match?.[1]);
};

export const resolveIrcCloudAvatarId = (
  user: Pick<UserIdentitySource, 'host' | 'username'>,
) =>
  extractIrcCloudAvatarId(user.username)
  ?? extractIrcCloudAvatarId(user.host);
