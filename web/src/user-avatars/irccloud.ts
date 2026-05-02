import type { ChannelState, ChannelUserState } from '../../../shared/protocol.js';
import { isSameIrcIdentifier } from '../../../shared/irc-identifiers.js';

export type UserAvatarCandidate = Pick<ChannelUserState, 'host' | 'nick' | 'username'>;

export const IRCLOUD_PUBLIC_AVATAR_BASE_URL =
  'https://static.irccloud-cdn.com/avatar-redirect/';

const ircCloudAvatarIdPattern = /(?:^|[^a-z0-9])(?:uid|sid)([1-9][0-9]*)(?=$|[^a-z0-9])/i;

export const extractIrcCloudAvatarId = (value: string | null | undefined) => {
  const match = value?.match(ircCloudAvatarIdPattern);
  return match?.[1] ?? null;
};

export const resolveIrcCloudAvatarId = (
  user: Pick<ChannelUserState, 'host' | 'username'>,
) =>
  extractIrcCloudAvatarId(user.username)
  ?? extractIrcCloudAvatarId(user.host);

export const resolveIrcCloudAvatarUrl = (
  user: Pick<ChannelUserState, 'host' | 'username'>,
) => {
  const avatarId = resolveIrcCloudAvatarId(user);
  return avatarId ? `${IRCLOUD_PUBLIC_AVATAR_BASE_URL}${avatarId}` : null;
};

export const resolveUserAvatarCandidate = (
  channels: ChannelState[],
  networkId: string,
  nick: string,
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
  return firstMatchedUser ?? {
    nick,
    username: null,
    host: null,
  } satisfies UserAvatarCandidate;
};
