import { emitChannel, emitMessage, emitPeerQuit, emitStatus } from './irc-emit.js';
import { handleAccountLoginState } from './irc-auth.js';
import {
  renameChannelUser,
  updateChannelUserAway,
  updateChannelUserDetails,
  upsertChannelUser,
} from '../shared/channel-users.js';
import { isSameIrcIdentifier, parseChannelUserToken, parsePrefixIdentity } from './irc-parser.js';
import { createMessage, isSelfNick } from './irc-handle-line-helpers.js';
import type { IrcChannelEventContext } from './irc-contexts.js';

export const handleJoin = (connection: IrcChannelEventContext, params: string[], prefix: string | null) => {
  const { nick, username, host } = parsePrefixIdentity(prefix);
  const name = (params[0] ?? '').replace(/^:/, '');
  if (!name) {
    return;
  }
  const account = normalizeAccountName(params[1] ?? null);
  const realname = params[2] ?? null;
  const selfJoin = isSelfNick(connection, nick);
  const pendingSession = selfJoin ? connection.getChannelSession(name) : null;
  const trackedChannel = connection.resolveTrackedChannel(name);
  if (selfJoin) {
    connection.rememberReconnectChannel(trackedChannel ?? name);
    connection.discardPendingChannelReplyContexts(name, (context) => context.operation === 'join');
    if (!pendingSession) {
      connection.setChannelSession(name, 'joined', { sourceTarget: 'server' });
    }
  }
  const channel = trackedChannel ?? connection.resolveTrackedChannel(name);
  if (!channel) {
    return;
  }
  const users = connection.updateChannelUsers(channel, nick, true, {
    account,
    username,
    host,
    realname,
  });
  emitMessage(connection, createMessage(connection, {
    target: channel,
    nick,
    body: `${nick ?? 'Someone'} joined ${channel}`,
    kind: 'join',
    self: selfJoin,
  }));
  emitChannel(connection, channel, { users });
  if (selfJoin && pendingSession) {
    connection.setChannelSession(channel, 'joined', { sourceTarget: pendingSession.sourceTarget });
  }
};

export const handlePart = (connection: IrcChannelEventContext, params: string[], nick: string | null) => {
  const channel = connection.resolveTrackedChannel(params[0] ?? '');
  if (!channel) {
    return;
  }
  const reason = params[1] ?? 'left';
  const selfPart = isSelfNick(connection, nick);
  const session = selfPart ? connection.getChannelSession(channel) : null;
  if (selfPart) {
    if (session?.phase !== 'joining') {
      connection.forgetReconnectChannel(channel);
    }
    connection.discardPendingChannelReplyContexts(channel, (context) => context.operation !== 'join');
  }
  const users = selfPart ? [] : connection.updateChannelUsers(channel, nick, false);
  if (selfPart) {
    connection.handleSelfChannelDeparture(channel);
  }
  emitMessage(connection, createMessage(connection, {
    target: channel,
    nick,
    body: `${nick ?? 'Someone'} left ${channel}${reason ? ` (${reason})` : ''}`,
    kind: 'part',
    self: selfPart,
  }));
  if (!selfPart) {
    emitChannel(connection, channel, { users });
  }
};

export const handleKick = (connection: IrcChannelEventContext, params: string[], nick: string | null) => {
  const channel = connection.resolveTrackedChannel(params[0] ?? '');
  const kickedNick = params[1] ?? '';
  if (!channel || !kickedNick || !connection.resolveTrackedChannel(channel)) {
    return;
  }
  const selfKick = isSelfNick(connection, kickedNick);
  const reason = params[2] ?? 'kicked';
  const session = selfKick ? connection.getChannelSession(channel) : null;
  if (selfKick) {
    if (session?.phase !== 'joining') {
      connection.forgetReconnectChannel(channel);
    }
    connection.discardPendingChannelReplyContexts(channel, (context) => context.operation !== 'join');
  }
  const users = selfKick ? [] : connection.updateChannelUsers(channel, kickedNick, false);
  if (selfKick) {
    connection.handleSelfChannelDeparture(channel);
  }
  emitMessage(connection, createMessage(connection, {
    target: channel,
    nick: kickedNick,
    body: `${kickedNick} was kicked from ${channel} by ${nick ?? 'Someone'}${reason ? ` (${reason})` : ''}`,
    kind: 'part',
    self: selfKick,
  }));
  if (!selfKick) {
    emitChannel(connection, channel, { users });
  }
};

export const handleQuit = (connection: IrcChannelEventContext, params: string[], nick: string | null) => {
  const reason = params[0] ?? 'quit';
  if (!nick) {
    return;
  }
  let sharedTrackedChannel = false;
  for (const [channel, users] of connection.getTrackedChannelUserEntries()) {
    const nextUsers = connection.updateChannelUsers(channel, nick, false);
    if (nextUsers.length !== users.length) {
      sharedTrackedChannel = true;
      emitMessage(connection, createMessage(connection, {
        target: channel,
        nick,
        body: `${nick} quit (${reason})`,
        kind: 'quit',
        self: isSelfNick(connection, nick),
      }));
      emitChannel(connection, channel, { users: nextUsers });
    }
  }
  if (sharedTrackedChannel) {
    emitPeerQuit(connection, {
      nick,
      reason,
      self: isSelfNick(connection, nick),
    });
  }
};

export const handleNick = (connection: IrcChannelEventContext, params: string[], nick: string | null) => {
  const newNick = params[0] ?? '';
  if (!newNick) {
    return;
  }
  for (const [channel, users] of connection.getTrackedChannelUserEntries()) {
    if (!nick) {
      continue;
    }
    const nextUsers = renameChannelUser(users, nick, newNick);
    if (nextUsers.length !== users.length || nextUsers.some((user, index) => user !== users[index])) {
      connection.setTrackedChannelUsers(channel, nextUsers);
      emitChannel(connection, channel, { users: nextUsers });
    }
  }
  if (isSelfNick(connection, nick)) {
    connection.confirmNick(newNick);
  }
  emitStatus(connection, `${nick ?? 'Someone'} is now known as ${newNick}`);
};

export const handleTopic = (connection: IrcChannelEventContext, params: string[], nick: string | null) => {
  const channel = connection.resolveTrackedChannel(params[0] ?? '');
  const topic = params[1] ?? '';
  if (!channel) {
    return;
  }
  if (isSelfNick(connection, nick)) {
    connection.discardPendingChannelReplyContexts(
      channel,
      (context) => context.operation === 'topic-set' && context.requestedTopic === topic
    );
  }
  emitChannel(connection, channel, { topic });
  emitStatus(connection, `${nick ?? 'Someone'} changed the topic for ${channel}`, 'system', channel, true);
};

export const handleTopicNumeric = (connection: IrcChannelEventContext, params: string[]) => {
  const channel = connection.resolveTrackedChannel(params[1] ?? '');
  if (channel) {
    emitChannel(connection, channel, { topic: params[2] ?? '' });
  }
};

export const handleNamesNumeric = (connection: IrcChannelEventContext, params: string[]) => {
  const channel = connection.resolveTrackedChannel(params[2] ?? '');
  if (!channel) {
    return;
  }
  let knownUsers = connection.getTrackedChannelUsers(channel);
  for (const name of (params[3] ?? '').split(' ')) {
    const user = parseChannelUserToken(name);
    if (user) {
      const existing = knownUsers.find((candidate) => isSameIrcIdentifier(candidate.nick, user.nick));
      knownUsers = upsertChannelUser(knownUsers, existing ? {
        ...user,
        away: existing.away,
        account: user.account ?? existing.account ?? null,
        username: user.username ?? existing.username ?? null,
        host: user.host ?? existing.host ?? null,
        realname: user.realname ?? existing.realname ?? null,
      } : user);
    }
  }
  connection.setTrackedChannelUsers(channel, knownUsers);
  emitChannel(connection, channel, { users: knownUsers });
};

export const handleWhoNumeric = (connection: IrcChannelEventContext, params: string[]) => {
  const channel = connection.resolveTrackedChannel(params[1] ?? '');
  const nick = params[5] ?? '';
  const flags = params[6] ?? '';
  if (!channel || !nick || !flags) {
    return;
  }
  const currentUsers = connection.getTrackedChannelUsers(channel);
  const users = updateChannelUserAway(currentUsers, nick, flags.includes('G'));
  if (users === currentUsers) {
    return;
  }
  connection.setTrackedChannelUsers(channel, users);
  emitChannel(connection, channel, { users });
};

export const handleAccount = (connection: IrcChannelEventContext, params: string[], nick: string | null) => {
  if (!nick) {
    return;
  }
  const account = normalizeAccountName(params[0] ?? null);
  if (isSelfNick(connection, nick)) {
    handleAccountLoginState(connection, account);
  }
  updateUsersAcrossTrackedChannels(connection, nick, (users) =>
    updateChannelUserDetails(users, nick, { account }),
  );
};

export const handleAway = (connection: IrcChannelEventContext, params: string[], nick: string | null) => {
  if (!nick) {
    return;
  }
  updateUsersAcrossTrackedChannels(connection, nick, (users) =>
    updateChannelUserAway(users, nick, params.length > 0),
  );
};

export const handleChghost = (connection: IrcChannelEventContext, params: string[], nick: string | null) => {
  if (!nick) {
    return;
  }
  const username = params[0]?.trim() || null;
  const host = params[1]?.trim() || null;
  updateUsersAcrossTrackedChannels(connection, nick, (users) =>
    updateChannelUserDetails(users, nick, { username, host }),
  );
};

export const handleSetname = (connection: IrcChannelEventContext, params: string[], nick: string | null) => {
  if (!nick) {
    return;
  }
  const realname = params[0]?.trim() || null;
  updateUsersAcrossTrackedChannels(connection, nick, (users) =>
    updateChannelUserDetails(users, nick, { realname }),
  );
};

const updateUsersAcrossTrackedChannels = (
  connection: IrcChannelEventContext,
  nick: string,
  updater: (users: ReturnType<IrcChannelEventContext['getTrackedChannelUsers']>) => ReturnType<IrcChannelEventContext['getTrackedChannelUsers']>,
) => {
  for (const [channel, users] of connection.getTrackedChannelUserEntries()) {
    const nextUsers = updater(users);
    if (nextUsers === users) {
      continue;
    }
    connection.setTrackedChannelUsers(channel, nextUsers);
    emitChannel(connection, channel, { users: nextUsers });
  }
};

const normalizeAccountName = (value: string | null) => {
  const account = value?.trim();
  return account && account !== '*' ? account : null;
};
