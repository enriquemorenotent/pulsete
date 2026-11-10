import { defaultIrcServerRules, type IrcServerRules } from './irc-server-rules.js';
import type { ChannelUserMode, ChannelUserPrivilegeMode, ChannelUserState } from './protocol-chat.js';
import { normalizeIrcIdentifier } from './irc-identifiers.js';
import {
  getChannelUserModeRank,
  getPrimaryChannelUserMode,
  normalizeChannelUserModes,
  orderedModes,
} from './channel-user-modes.js';
import { resolveNetworkUserIdentity } from './user-identity.js';

export {
  channelUserGroupLabels,
  getChannelUserModeRank,
  getPrimaryChannelUserMode,
  normalizeChannelUserModes,
} from './channel-user-modes.js';

export const parseChannelUser = (
  value: string | ChannelUserState | null | undefined, rules: IrcServerRules = defaultIrcServerRules
): ChannelUserState | null => {
  if (!value) {
    return null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const prefixes = parseChannelUserPrefixes(trimmed, rules);
    const identity = parseUserHost(prefixes.value);
    return identity.nick
      ? normalizeChannelUser({
          nick: identity.nick,
          mode: getPrimaryChannelUserMode(prefixes.modes),
          modes: prefixes.modes,
          away: false,
          username: identity.username,
          host: identity.host,
          account: null,
          realname: null,
        })
      : null;
  }
  const nick = value.nick.trim();
  if (!nick) {
    return null;
  }
  return normalizeChannelUser({
    nick,
    mode: orderedModes.includes(value.mode) ? value.mode : 'normal',
    modes: getStoredChannelUserModes(value),
    away: value.away === true,
    account: value.account?.trim() || null,
    username: value.username?.trim() || null,
    host: value.host?.trim() || null,
    realname: value.realname?.trim() || null,
  });
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

export const upsertChannelUser = (users: ChannelUserState[], value: string | ChannelUserState, rules: IrcServerRules = defaultIrcServerRules) => {
  const user = parseChannelUser(value, rules);
  if (!user) {
    return sortChannelUsers(users);
  }
  const normalizedNick = normalizeIrcIdentifier(user.nick, rules.caseMapping);
  const nextUsers = users.filter((candidate) => normalizeIrcIdentifier(candidate.nick, rules.caseMapping) !== normalizedNick);
  nextUsers.push(user);
  return sortChannelUsers(nextUsers);
};

export const removeChannelUser = (users: ChannelUserState[], nick: string, rules: IrcServerRules = defaultIrcServerRules) => {
  const normalizedNick = normalizeIrcIdentifier(nick, rules.caseMapping);
  return users.filter((candidate) => normalizeIrcIdentifier(candidate.nick, rules.caseMapping) !== normalizedNick);
};

export const renameChannelUser = (users: ChannelUserState[], previousNick: string, nextNick: string, rules: IrcServerRules = defaultIrcServerRules) => {
  const normalizedPreviousNick = normalizeIrcIdentifier(previousNick, rules.caseMapping);
  const existing = users.find((candidate) => normalizeIrcIdentifier(candidate.nick, rules.caseMapping) === normalizedPreviousNick);
  if (!existing) {
    return users;
  }
  return upsertChannelUser(removeChannelUser(users, previousNick, rules), {
    nick: nextNick,
    mode: existing.mode,
    modes: getStoredChannelUserModes(existing),
    away: existing.away,
    account: existing.account ?? null,
    username: existing.username ?? null,
    host: existing.host ?? null,
    realname: existing.realname ?? null,
  }, rules);
};

export const updateChannelUserMode = (
  users: ChannelUserState[],
  nick: string,
  mode: ChannelUserPrivilegeMode,
  active: boolean, rules: IrcServerRules = defaultIrcServerRules
) => {
  const normalizedNick = normalizeIrcIdentifier(nick, rules.caseMapping);
  const existing = users.find((candidate) => normalizeIrcIdentifier(candidate.nick, rules.caseMapping) === normalizedNick);
  if (!existing) {
    return users;
  }
  const currentModes = getStoredChannelUserModes(existing);
  const nextModes = active
    ? normalizeChannelUserModes([...currentModes, mode])
    : currentModes.filter((candidate) => candidate !== mode);
  if (areSameChannelUserModes(currentModes, nextModes)) {
    return users;
  }
  return upsertChannelUser(users, {
    nick: existing.nick,
    mode: getPrimaryChannelUserMode(nextModes),
    modes: nextModes,
    away: existing.away,
    account: existing.account ?? null,
    username: existing.username ?? null,
    host: existing.host ?? null,
    realname: existing.realname ?? null,
  }, rules);
};

export const updateChannelUserAway = (users: ChannelUserState[], nick: string, away: boolean, rules: IrcServerRules = defaultIrcServerRules) => {
  const normalizedNick = normalizeIrcIdentifier(nick, rules.caseMapping);
  const existing = users.find((candidate) => normalizeIrcIdentifier(candidate.nick, rules.caseMapping) === normalizedNick);
  if (!existing || existing.away === away) {
    return users;
  }
  return upsertChannelUser(users, {
    nick: existing.nick,
    mode: existing.mode,
    modes: getStoredChannelUserModes(existing),
    away,
    account: existing.account ?? null,
    username: existing.username ?? null,
    host: existing.host ?? null,
    realname: existing.realname ?? null,
  }, rules);
};

export const updateChannelUserDetails = (
  users: ChannelUserState[],
  nick: string,
  updates: Partial<Pick<ChannelUserState, 'account' | 'host' | 'realname' | 'username'>>, rules: IrcServerRules = defaultIrcServerRules
) => {
  const normalizedNick = normalizeIrcIdentifier(nick, rules.caseMapping);
  const existing = users.find((candidate) => normalizeIrcIdentifier(candidate.nick, rules.caseMapping) === normalizedNick);
  if (!existing) {
    return users;
  }
  const nextUser = parseChannelUser({
    nick: existing.nick,
    mode: existing.mode,
    modes: getStoredChannelUserModes(existing),
    away: existing.away,
    account: updates.account === undefined ? existing.account ?? null : updates.account,
    username: updates.username === undefined ? existing.username ?? null : updates.username,
    host: updates.host === undefined ? existing.host ?? null : updates.host,
    realname: updates.realname === undefined ? existing.realname ?? null : updates.realname,
  }, rules);
  if (!nextUser) {
    return users;
  }
  const unchanged = (
    nextUser.account === (existing.account ?? null)
    && nextUser.username === (existing.username ?? null)
    && nextUser.host === (existing.host ?? null)
    && nextUser.realname === (existing.realname ?? null)
  );
  return unchanged ? users : upsertChannelUser(users, nextUser, rules);
};

type NormalizableChannelUser = Omit<ChannelUserState, 'modes'> & {
  modes: readonly ChannelUserMode[];
};

const normalizeChannelUser = (user: NormalizableChannelUser): ChannelUserState => {
  const modes = normalizeChannelUserModes(user.modes);
  return {
    nick: user.nick,
    mode: getPrimaryChannelUserMode(modes),
    modes,
    away: user.away,
    account: user.account ?? null,
    username: user.username ?? null,
    host: user.host ?? null,
    identity: resolveNetworkUserIdentity({
      account: user.account,
      username: user.username,
      host: user.host,
      nick: user.nick,
    }) ?? undefined,
    realname: user.realname ?? null,
  };
};

const getStoredChannelUserModes = (
  user: Pick<ChannelUserState, 'mode' | 'modes'>
) => normalizeChannelUserModes(user.modes && user.modes.length > 0 ? user.modes : [user.mode]);

const parseChannelUserPrefixes = (value: string, rules: IrcServerRules) => {
  const modes: ChannelUserPrivilegeMode[] = [];
  let index = 0;
  while (index < value.length) {
    const prefix = value[index]!;
    const statusIndex = rules.prefixSymbols.indexOf(prefix);
    if (statusIndex < 0) {
      break;
    }
    const statusMode = rules.prefixModes[statusIndex];
    const mode = ({q:'owner',a:'admin',o:'op',h:'halfop',v:'voice'} as const)[statusMode as 'o'];
    if (mode) modes.push(mode);
    index += 1;
  }
  return {
    modes: normalizeChannelUserModes(modes),
    value: value.slice(index),
  };
};

const areSameChannelUserModes = (
  left: readonly ChannelUserPrivilegeMode[],
  right: readonly ChannelUserPrivilegeMode[]
) => left.length === right.length && left.every((mode, index) => mode === right[index]);

const parseUserHost = (value: string) => {
  const [nickPart, rest = ''] = value.split('!', 2);
  const [usernamePart, hostPart = ''] = rest.split('@', 2);
  return {
    nick: nickPart.trim(),
    username: usernamePart.trim() || null,
    host: hostPart.trim() || null,
  };
};
