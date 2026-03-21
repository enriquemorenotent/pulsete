import { removeChannelUser, upsertChannelUser } from '../shared/channel-users.js';
import type { ChannelUserState } from '../shared/protocol.js';
import { emitPendingChannel, emitPendingChannelRemoved, emitStatus } from './irc-emit.js';
import { findIrcCaseMatch } from './irc-parser.js';
import type { PendingReplyContext } from './irc-reply-context.js';
import type { ChannelSessionPhase, ChannelSessionState } from './irc-types.js';
import type { IrcConnection } from './irc.js';

export const updateChannelUsers = (connection: IrcConnection, channel: string, nick: string | null, joined: boolean) => {
  const channelKey = resolveTrackedChannelKey(connection, channel) ?? channel;
  const current = connection.channels.users.get(channelKey) ?? [];
  const nextUsers = !nick ? current : joined ? upsertChannelUser(current, { nick, mode: 'normal' }) : removeChannelUser(current, nick);
  connection.channels.users.set(channelKey, nextUsers);
  return nextUsers;
};

export const getTrackedChannelUsers = (connection: IrcConnection, channel: string) => {
  const key = resolveTrackedChannel(connection, channel);
  return key ? connection.channels.users.get(key) ?? [] : [];
};

export const setTrackedChannelUsers = (connection: IrcConnection, channel: string, users: ChannelUserState[]) => {
  const key = resolveTrackedChannelKey(connection, channel) ?? channel;
  connection.channels.users.set(key, users);
  return users;
};

export const getTrackedChannelUserEntries = (connection: IrcConnection) =>
  Array.from(connection.channels.users.entries(), ([channel, users]) => [channel, users] as [string, ChannelUserState[]]);

export const resolveTrackedChannel = (connection: IrcConnection, channel: string) =>
  resolveTrackedChannelKey(connection, channel, false);

export const clearExpiredChannelSessions = (connection: IrcConnection) => {
  connection.prunePendingReplyContexts();
};

export const getChannelSession = (connection: IrcConnection, channel: string) => {
  const key = resolveTrackedChannelKey(connection, channel, false);
  return key ? connection.channels.sessions.get(key) ?? null : null;
};

export const listPendingChannels = (connection: IrcConnection) =>
  Array.from(connection.channels.sessions.values())
    .filter((session) => session.phase === 'joining' && session.visiblePending)
    .map((session) => ({ networkId: connection.profile.id, channel: session.channel }));

export const trackChannel = (connection: IrcConnection, channel: string) =>
  setChannelSession(connection, channel, 'joined', { visiblePending: false }).channel;

export const untrackChannel = (connection: IrcConnection, channel: string) => {
  removeChannelSession(connection, channel);
};

export const removeChannelSession = (connection: IrcConnection, channel: string) => {
  const key = resolveTrackedChannelKey(connection, channel, false);
  if (!key) {
    return null;
  }
  const session = connection.channels.sessions.get(key) ?? null;
  connection.channels.users.delete(key);
  if (!session) {
    return null;
  }
  clearChannelJoinTimer(session);
  connection.channels.sessions.delete(key);
  hidePendingChannel(connection, session);
  return { ...session, joinTimeoutTimer: null };
};

export const handleSelfChannelDeparture = (connection: IrcConnection, channel: string) => {
  const session = getChannelSession(connection, channel);
  if (session?.phase === 'joining') {
    setTrackedChannelUsers(connection, channel, []);
    setChannelSession(connection, channel, 'joining', {
      sourceTarget: session.sourceTarget,
      visiblePending: session.visiblePending,
      previouslyJoined: false,
    });
    return;
  }
  removeChannelSession(connection, channel);
};

export const setChannelSession = (
  connection: IrcConnection,
  channel: string,
  phase: ChannelSessionPhase,
  options: { sourceTarget?: string; visiblePending?: boolean; previouslyJoined?: boolean } = {}
) => {
  const key = resolveTrackedChannelKey(connection, channel) ?? channel;
  const current = connection.channels.sessions.get(key) ?? null;
  const existingUsers = connection.channels.users.get(key) ?? [];
  if (current) {
    clearChannelJoinTimer(current);
  }
  const next: ChannelSessionState = {
    channel: current?.channel ?? channel,
    phase,
    sourceTarget: options.sourceTarget ?? current?.sourceTarget ?? 'server',
    visiblePending: options.visiblePending ?? current?.visiblePending ?? false,
    previouslyJoined: options.previouslyJoined ?? current?.previouslyJoined ?? false,
    joinTimeoutTimer: null,
  };
  if (phase === 'joining') {
    next.previouslyJoined = options.previouslyJoined ?? (
      current?.phase === 'joined' || current?.previouslyJoined === true || existingUsers.length > 0
    );
    next.joinTimeoutTimer = createChannelJoinTimer(connection, next.channel);
  } else {
    next.visiblePending = false;
    next.previouslyJoined = false;
  }
  connection.channels.sessions.set(key, next);
  if (!current?.visiblePending && next.visiblePending) {
    emitPendingChannel(connection, next.channel);
  }
  if (current?.visiblePending && !next.visiblePending) {
    emitPendingChannelRemoved(connection, next.channel);
  }
  return next;
};

export const clearChannelSessions = (connection: IrcConnection) => {
  for (const session of connection.channels.sessions.values()) {
    clearChannelJoinTimer(session);
    hidePendingChannel(connection, session);
  }
  connection.channels.sessions.clear();
  connection.channels.users.clear();
};

export const discardPendingChannelReplyContexts = (
  connection: IrcConnection,
  channel: string,
  predicate?: (context: Extract<PendingReplyContext, { kind: 'channel' }>) => boolean
) => connection.replyTracker.discardPendingChannelReplyContexts(channel, predicate);

const resolveTrackedChannelKey = (connection: IrcConnection, channel: string, createIfMissing = true) =>
  findIrcCaseMatch(connection.channels.sessions.keys(), channel)
  ?? findIrcCaseMatch(connection.channels.users.keys(), channel)
  ?? (createIfMissing ? channel : null);

const hidePendingChannel = (connection: IrcConnection, session: ChannelSessionState) => {
  if (session.visiblePending) {
    emitPendingChannelRemoved(connection, session.channel);
  }
};

const clearChannelJoinTimer = (session: ChannelSessionState) => {
  if (!session.joinTimeoutTimer) {
    return;
  }
  clearTimeout(session.joinTimeoutTimer);
  session.joinTimeoutTimer = null;
};

const createChannelJoinTimer = (connection: IrcConnection, channel: string) => {
  if (connection.channels.joinTimeoutMs <= 0) {
    return null;
  }
  const timer = setTimeout(() => handleChannelJoinTimeout(connection, channel), connection.channels.joinTimeoutMs);
  timer.unref?.();
  return timer;
};

const handleChannelJoinTimeout = (connection: IrcConnection, channel: string) => {
  const session = getChannelSession(connection, channel);
  if (!session || session.phase !== 'joining') {
    return;
  }
  const sourceTarget = session.sourceTarget;
  if (session.previouslyJoined) {
    setChannelSession(connection, channel, 'joined', { sourceTarget });
  } else {
    removeChannelSession(connection, channel);
  }
  emitStatus(connection, `Timed out joining ${channel}`, 'error', sourceTarget);
};
