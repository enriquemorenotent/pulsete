import type { ChannelUserMode, ChannelUserState } from './protocol.js';
import { normalizeIrcIdentifier } from './irc-identifiers.js';

const modeByPrefix = {
  '~': 'owner',
  '&': 'admin',
  '@': 'op',
  '%': 'halfop',
  '+': 'voice',
} as const satisfies Record<string, Exclude<ChannelUserMode, 'normal'>>;

const orderedModes: ChannelUserMode[] = ['owner', 'admin', 'op', 'halfop', 'voice', 'normal'];

export const channelUserGroupLabels: Record<ChannelUserMode, string> = {
  owner: 'Owners',
  admin: 'Admins',
  op: 'Operators',
  halfop: 'Half-Ops',
  voice: 'Voiced',
  normal: 'Users',
};

export const getChannelUserModeRank = (mode: ChannelUserMode) =>
  orderedModes.indexOf(mode);

export const parseChannelUser = (
  value: string | ChannelUserState | null | undefined
): ChannelUserState | null => {
  if (!value) {
    return null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const maybePrefix = trimmed[0] ?? '';
    const prefix = Object.prototype.hasOwnProperty.call(modeByPrefix, maybePrefix)
      ? (maybePrefix as keyof typeof modeByPrefix)
      : null;
    const identity = parseUserHost(prefix ? trimmed.slice(1) : trimmed);
    return identity.nick
      ? {
          nick: identity.nick,
          mode: prefix ? modeByPrefix[prefix] : 'normal',
          away: false,
          username: identity.username,
          host: identity.host,
          account: null,
          realname: null,
        }
      : null;
  }
  const nick = value.nick.trim();
  if (!nick) {
    return null;
  }
  return {
    nick,
    mode: orderedModes.includes(value.mode) ? value.mode : 'normal',
    away: value.away === true,
    account: value.account?.trim() || null,
    username: value.username?.trim() || null,
    host: value.host?.trim() || null,
    realname: value.realname?.trim() || null,
  };
};

export const compareChannelUsers = (left: ChannelUserState, right: ChannelUserState) => {
  const modeDifference = getChannelUserModeRank(left.mode) - getChannelUserModeRank(right.mode);
  if (modeDifference !== 0) {
    return modeDifference;
  }
  return left.nick.localeCompare(right.nick, undefined, { sensitivity: 'accent' });
};

export const sortChannelUsers = (users: ChannelUserState[]) =>
  [...users].sort(compareChannelUsers);

export const upsertChannelUser = (users: ChannelUserState[], value: string | ChannelUserState) => {
  const user = parseChannelUser(value);
  if (!user) {
    return sortChannelUsers(users);
  }
  const normalizedNick = normalizeIrcIdentifier(user.nick);
  const nextUsers = users.filter((candidate) => normalizeIrcIdentifier(candidate.nick) !== normalizedNick);
  nextUsers.push(user);
  return sortChannelUsers(nextUsers);
};

export const removeChannelUser = (users: ChannelUserState[], nick: string) => {
  const normalizedNick = normalizeIrcIdentifier(nick);
  return users.filter((candidate) => normalizeIrcIdentifier(candidate.nick) !== normalizedNick);
};

export const renameChannelUser = (users: ChannelUserState[], previousNick: string, nextNick: string) => {
  const normalizedPreviousNick = normalizeIrcIdentifier(previousNick);
  const existing = users.find((candidate) => normalizeIrcIdentifier(candidate.nick) === normalizedPreviousNick);
  if (!existing) {
    return users;
  }
  return upsertChannelUser(removeChannelUser(users, previousNick), {
    nick: nextNick,
    mode: existing.mode,
    away: existing.away,
    account: existing.account ?? null,
    username: existing.username ?? null,
    host: existing.host ?? null,
    realname: existing.realname ?? null,
  });
};

export const updateChannelUserMode = (users: ChannelUserState[], nick: string, mode: ChannelUserMode) => {
  const normalizedNick = normalizeIrcIdentifier(nick);
  const existing = users.find((candidate) => normalizeIrcIdentifier(candidate.nick) === normalizedNick);
  if (!existing) {
    return users;
  }
  return upsertChannelUser(users, {
    nick: existing.nick,
    mode,
    away: existing.away,
    account: existing.account ?? null,
    username: existing.username ?? null,
    host: existing.host ?? null,
    realname: existing.realname ?? null,
  });
};

export const updateChannelUserAway = (users: ChannelUserState[], nick: string, away: boolean) => {
  const normalizedNick = normalizeIrcIdentifier(nick);
  const existing = users.find((candidate) => normalizeIrcIdentifier(candidate.nick) === normalizedNick);
  if (!existing || existing.away === away) {
    return users;
  }
  return upsertChannelUser(users, {
    nick: existing.nick,
    mode: existing.mode,
    away,
    account: existing.account ?? null,
    username: existing.username ?? null,
    host: existing.host ?? null,
    realname: existing.realname ?? null,
  });
};

export const updateChannelUserDetails = (
  users: ChannelUserState[],
  nick: string,
  updates: Partial<Pick<ChannelUserState, 'account' | 'host' | 'realname' | 'username'>>
) => {
  const normalizedNick = normalizeIrcIdentifier(nick);
  const existing = users.find((candidate) => normalizeIrcIdentifier(candidate.nick) === normalizedNick);
  if (!existing) {
    return users;
  }
  const nextUser = parseChannelUser({
    nick: existing.nick,
    mode: existing.mode,
    away: existing.away,
    account: updates.account === undefined ? existing.account ?? null : updates.account,
    username: updates.username === undefined ? existing.username ?? null : updates.username,
    host: updates.host === undefined ? existing.host ?? null : updates.host,
    realname: updates.realname === undefined ? existing.realname ?? null : updates.realname,
  });
  if (!nextUser) {
    return users;
  }
  const unchanged = (
    nextUser.account === (existing.account ?? null)
    && nextUser.username === (existing.username ?? null)
    && nextUser.host === (existing.host ?? null)
    && nextUser.realname === (existing.realname ?? null)
  );
  return unchanged ? users : upsertChannelUser(users, nextUser);
};

const parseUserHost = (value: string) => {
  const [nickPart, rest = ''] = value.split('!', 2);
  const [usernamePart, hostPart = ''] = rest.split('@', 2);
  return {
    nick: nickPart.trim(),
    username: usernamePart.trim() || null,
    host: hostPart.trim() || null,
  };
};
