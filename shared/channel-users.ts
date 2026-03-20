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
    const nick = prefix ? trimmed.slice(1) : trimmed;
    return nick ? { nick, mode: prefix ? modeByPrefix[prefix] : 'normal' } : null;
  }
  const nick = value.nick.trim();
  if (!nick) {
    return null;
  }
  return {
    nick,
    mode: orderedModes.includes(value.mode) ? value.mode : 'normal',
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
  });
};
