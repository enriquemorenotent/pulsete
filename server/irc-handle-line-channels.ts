import { emitChannel, emitMessage, emitStatus } from './irc-emit.js';
import { renameChannelUser, upsertChannelUser } from '../shared/channel-users.js';
import { parseChannelUserToken } from './irc-parser.js';
import { createMessage, isSelfNick } from './irc-handle-line-helpers.js';
import type { IrcConnectionState } from './irc-types.js';

export const handleJoin = (connection: IrcConnectionState, params: string[], nick: string | null) => {
  const name = (params[0] ?? params[1] ?? '').replace(/^:/, '');
  if (!name) {
    return;
  }
  const selfJoin = isSelfNick(connection, nick);
  const pendingSession = selfJoin ? connection.ports.channels.getChannelSession(name) : null;
  if (selfJoin) {
    connection.ports.reply.discardPendingChannelReplyContexts(name, (context) => context.operation === 'join');
    if (!pendingSession) {
      connection.ports.channels.setChannelSession(name, 'joined', { sourceTarget: 'server' });
    }
  }
  const channel = connection.ports.channels.resolveTrackedChannel(name);
  if (!channel) {
    return;
  }
  const users = connection.ports.channels.updateChannelUsers(channel, nick, true);
  emitMessage(connection, createMessage(connection, {
    target: channel,
    nick,
    body: `${nick ?? 'Someone'} joined ${channel}`,
    kind: 'join',
    self: selfJoin,
  }));
  emitChannel(connection, channel, { users });
  if (selfJoin && pendingSession) {
    connection.ports.channels.setChannelSession(channel, 'joined', { sourceTarget: pendingSession.sourceTarget });
  }
};

export const handlePart = (connection: IrcConnectionState, params: string[], nick: string | null) => {
  const channel = connection.ports.channels.resolveTrackedChannel(params[0] ?? '');
  if (!channel) {
    return;
  }
  const reason = params[1] ?? 'left';
  const selfPart = isSelfNick(connection, nick);
  if (selfPart) {
    connection.ports.reply.discardPendingChannelReplyContexts(channel, (context) => context.operation !== 'join');
  }
  const users = selfPart ? [] : connection.ports.channels.updateChannelUsers(channel, nick, false);
  if (selfPart) {
    connection.ports.channels.handleSelfChannelDeparture(channel);
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

export const handleKick = (connection: IrcConnectionState, params: string[], nick: string | null) => {
  const channel = connection.ports.channels.resolveTrackedChannel(params[0] ?? '');
  const kickedNick = params[1] ?? '';
  if (!channel || !kickedNick || !connection.ports.channels.resolveTrackedChannel(channel)) {
    return;
  }
  const selfKick = isSelfNick(connection, kickedNick);
  const reason = params[2] ?? 'kicked';
  if (selfKick) {
    connection.ports.reply.discardPendingChannelReplyContexts(channel, (context) => context.operation !== 'join');
  }
  const users = selfKick ? [] : connection.ports.channels.updateChannelUsers(channel, kickedNick, false);
  if (selfKick) {
    connection.ports.channels.handleSelfChannelDeparture(channel);
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

export const handleQuit = (connection: IrcConnectionState, params: string[], nick: string | null) => {
  emitStatus(connection, `${nick ?? 'Someone'} quit (${params[0] ?? 'quit'})`);
  if (!nick) {
    return;
  }
  for (const [channel, users] of connection.ports.channels.getTrackedChannelUserEntries()) {
    const nextUsers = connection.ports.channels.updateChannelUsers(channel, nick, false);
    if (nextUsers.length !== users.length) {
      emitChannel(connection, channel, { users: nextUsers });
    }
  }
};

export const handleNick = (connection: IrcConnectionState, params: string[], nick: string | null) => {
  const newNick = params[0] ?? '';
  if (!newNick) {
    return;
  }
  for (const [channel, users] of connection.ports.channels.getTrackedChannelUserEntries()) {
    if (!nick) {
      continue;
    }
    const nextUsers = renameChannelUser(users, nick, newNick);
    if (nextUsers.length !== users.length || nextUsers.some((user, index) => user !== users[index])) {
      connection.ports.channels.setTrackedChannelUsers(channel, nextUsers);
      emitChannel(connection, channel, { users: nextUsers });
    }
  }
  if (isSelfNick(connection, nick)) {
    connection.ports.command.confirmNick(newNick);
  }
  emitStatus(connection, `${nick ?? 'Someone'} is now known as ${newNick}`);
};

export const handleTopic = (connection: IrcConnectionState, params: string[], nick: string | null) => {
  const channel = connection.ports.channels.resolveTrackedChannel(params[0] ?? '');
  const topic = params[1] ?? '';
  if (!channel) {
    return;
  }
  if (isSelfNick(connection, nick)) {
    connection.ports.reply.discardPendingChannelReplyContexts(
      channel,
      (context) => context.operation === 'topic-set' && context.requestedTopic === topic
    );
  }
  emitChannel(connection, channel, { topic });
  emitStatus(connection, `${nick ?? 'Someone'} changed the topic for ${channel}`, 'system', channel, true);
};

export const handleTopicNumeric = (connection: IrcConnectionState, params: string[]) => {
  const channel = connection.ports.channels.resolveTrackedChannel(params[1] ?? '');
  if (channel) {
    emitChannel(connection, channel, { topic: params[2] ?? '' });
  }
};

export const handleNamesNumeric = (connection: IrcConnectionState, params: string[]) => {
  const channel = connection.ports.channels.resolveTrackedChannel(params[2] ?? '');
  if (!channel) {
    return;
  }
  let knownUsers = connection.ports.channels.getTrackedChannelUsers(channel);
  for (const name of (params[3] ?? '').split(' ')) {
    const user = parseChannelUserToken(name);
    if (user) {
      knownUsers = upsertChannelUser(knownUsers, user);
    }
  }
  connection.ports.channels.setTrackedChannelUsers(channel, knownUsers);
  emitChannel(connection, channel, { users: knownUsers });
};
