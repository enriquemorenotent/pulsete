import type { ChannelState, ChannelUserState } from '../../../shared/protocol-chat.js';
import { isSameIrcIdentifier } from '../../../shared/irc-identifiers.js';
import {
  extractIrcCloudAvatarId,
  normalizeIrcCloudAvatarId,
  resolveIrcCloudAvatarId,
} from '../../../shared/irccloud-avatar.js';

export {
  extractIrcCloudAvatarId,
  resolveIrcCloudAvatarId,
} from '../../../shared/irccloud-avatar.js';

export type UserAvatarCandidate = Pick<ChannelUserState, 'account' | 'host' | 'identity' | 'nick' | 'username'> & {
  ircCloudAvatarId?: string;
};

export const IRCLOUD_PUBLIC_AVATAR_BASE_URL =
  'https://static.irccloud-cdn.com/avatar-redirect/';

export const resolveIrcCloudAvatarUrlFromId = (avatarId: string | null | undefined) => {
  const normalizedAvatarId = normalizeIrcCloudAvatarId(avatarId);
  return normalizedAvatarId ? `${IRCLOUD_PUBLIC_AVATAR_BASE_URL}${normalizedAvatarId}` : null;
};

export const resolveIrcCloudAvatarUrl = (
  user: Pick<ChannelUserState, 'host' | 'username'> & { ircCloudAvatarId?: string | null },
) => {
  const avatarId = resolveIrcCloudAvatarId(user) ?? user.ircCloudAvatarId;
  return resolveIrcCloudAvatarUrlFromId(avatarId);
};

export const resolveUserAvatarCandidate = (
  channels: ChannelState[],
  networkId: string,
  nick: string,
  fallbackIrcCloudAvatarId?: string | null,
): UserAvatarCandidate => {
  let firstMatchedUser: UserAvatarCandidate | null = null;
  for (const channel of channels) {
    if (channel.networkId !== networkId) {
      continue;
    }
    for (const user of channel.users) {
      if (!isSameIrcIdentifier(user.nick, nick)) {
        continue;
      }
      firstMatchedUser ??= user;
      if (resolveIrcCloudAvatarUrl(user)) {
        return user;
      }
    }
  }
  const fallbackAvatarId = normalizeIrcCloudAvatarId(fallbackIrcCloudAvatarId);
  if (firstMatchedUser) {
    return fallbackAvatarId
      ? { ...firstMatchedUser, ircCloudAvatarId: fallbackAvatarId }
      : firstMatchedUser;
  }
  return {
    nick,
    account: null,
    username: null,
    host: null,
    identity: undefined,
    ...(fallbackAvatarId ? { ircCloudAvatarId: fallbackAvatarId } : {}),
  } satisfies UserAvatarCandidate;
};
