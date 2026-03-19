import { randomUUID } from 'node:crypto';
import tls from 'node:tls';
import type { MessageInput } from './storage.js';
import { emitChannel, emitMessage, emitState, emitStatus } from './irc-emit.js';
import { formatServerNumeric } from './irc-server-log.js';
import { isServiceNick } from './irc-services.js';
import {
  findIrcCaseMatch,
  isChannelTarget,
  isSameIrcIdentifier,
  nickFromPrefix,
  normalizeChannelUser,
  parseLine,
  stripCtcp,
} from './irc-parser.js';
import type { IrcConnectionState } from './irc-types.js';

const nickRejectionCommands = new Set(['431', '432', '436', '437']);

export const handleIrcLine = (connection: IrcConnectionState, line: string) => {
  const { prefix, command, params } = parseLine(line);
  const nick = nickFromPrefix(prefix);
  if (command === 'PING') {
    connection.sendRaw(`PONG ${params.join(' ')}`);
    return;
  }
  if (handleWelcome(connection, command, params, nick) || handleNickConflict(connection, command) || handleNickRejected(connection, command)) {
    return;
  }
  if (/^\d{3}$/.test(command)) {
    for (const lineText of formatServerNumeric(command, params)) {
      emitStatus(connection, lineText);
    }
  }
  if (command === 'PRIVMSG' || command === 'NOTICE') {
    handleTextMessage(connection, command, params, nick);
    return;
  }
  if (command === 'JOIN') {
    handleJoin(connection, params, nick);
    return;
  }
  if (command === 'PART') {
    handlePart(connection, params, nick);
    return;
  }
  if (command === 'KICK') {
    handleKick(connection, params, nick);
    return;
  }
  if (command === 'QUIT') {
    handleQuit(connection, params, nick);
    return;
  }
  if (command === 'NICK') {
    handleNick(connection, params, nick);
    return;
  }
  if (command === 'TOPIC') {
    handleTopic(connection, params);
    return;
  }
  if (command === '332') {
    const channel = resolveTrackedChannel(connection, params[1] ?? '');
    if (channel) {
      emitChannel(connection, channel, { topic: params[2] ?? '' });
    }
    return;
  }
  if (command === '353') {
    const channel = resolveTrackedChannel(connection, params[2] ?? '');
    if (channel) {
      const names = (params[3] ?? '').split(' ').map(normalizeChannelUser).filter(Boolean);
      const knownUsers = new Set(connection.channelUsers.get(channel) ?? []);
      for (const user of names) {
        const existingUser = findIrcCaseMatch(knownUsers, user);
        if (existingUser && existingUser !== user) {
          knownUsers.delete(existingUser);
        }
        knownUsers.add(user);
      }
      const mergedUsers = Array.from(knownUsers);
      connection.channelUsers.set(channel, new Set(mergedUsers));
      emitChannel(connection, channel, { users: mergedUsers });
    }
  }
};

const handleWelcome = (connection: IrcConnectionState, command: string, params: string[], nick: string | null) => {
  if (command !== '001') {
    return false;
  }
  connection.connected = true;
  connection.serverName = nick ?? connection.profile.host;
  connection.reconnectAttempts = 0;
  connection.currentNick = params[0] ?? connection.profile.nick;
  connection.pendingNick = null;
  emitState(connection);
  for (const line of formatServerNumeric(command, params)) {
    emitStatus(connection, line);
  }
  emitStatus(
    connection,
    connection.socket instanceof tls.TLSSocket
      ? `* Connected securely via ${connection.socket.getProtocol() ?? 'TLS'} ${connection.socket.getCipher().standardName ?? connection.socket.getCipher().name}`
      : '* Connected via TCP'
  );
  for (const channel of connection.profile.autoJoin) {
    connection.join(channel);
  }
  return true;
};

const handleNickConflict = (connection: IrcConnectionState, command: string) => {
  if (command !== '433') {
    return false;
  }
  const attemptedNick = connection.pendingNick ?? connection.currentNick;
  const fallbackNick = getNextNickOnConflict(connection, attemptedNick);
  if (connection.pendingNick) {
    connection.pendingNick = fallbackNick;
  } else {
    connection.currentNick = fallbackNick;
  }
  connection.sendRaw(`NICK ${fallbackNick}`);
  emitStatus(connection, `${attemptedNick} is already in use. Retrying with ${fallbackNick}...`, 'notice');
  return true;
};

const handleNickRejected = (connection: IrcConnectionState, command: string) => {
  if (!connection.pendingNick || !nickRejectionCommands.has(command)) {
    return false;
  }
  const rejectedNick = connection.pendingNick;
  connection.pendingNick = null;
  emitStatus(connection, `${rejectedNick} was rejected by the server`, 'error');
  return true;
};

const getNextNickOnConflict = (connection: IrcConnectionState, attemptedNick: string) => {
  const fallbacks = [connection.profile.nick, ...connection.profile.altNicks]
    .filter((nick, index, list) => nick && list.indexOf(nick) === index);
  const currentIndex = fallbacks.indexOf(attemptedNick);
  if (currentIndex !== -1 && currentIndex < fallbacks.length - 1) {
    return fallbacks[currentIndex + 1];
  }
  return `${attemptedNick}_`;
};

const handleTextMessage = (connection: IrcConnectionState, command: 'PRIVMSG' | 'NOTICE', params: string[], nick: string | null) => {
  const rawTarget = params[0] ?? 'server';
  const trackedChannel = isChannelTarget(rawTarget) ? resolveTrackedChannel(connection, rawTarget) : null;
  if (isChannelTarget(rawTarget) && !trackedChannel) {
    return;
  }
  const payload = params[1] ?? '';
  const ctcp = stripCtcp(payload);
  const isDirectTarget = !isChannelTarget(rawTarget) && isSameIrcIdentifier(rawTarget, connection.currentNick);
  const isDirectCtcp = isDirectTarget && ctcp !== null && !ctcp.startsWith('ACTION ');
  const isDirectServiceMessage = isDirectTarget && command === 'PRIVMSG' && isServiceNick(nick);
  const target = isDirectTarget
    ? (command === 'NOTICE' || isDirectCtcp || isDirectServiceMessage ? 'server' : nick ?? rawTarget)
    : trackedChannel ?? rawTarget;
  const body = ctcp?.startsWith('ACTION ')
    ? `* ${nick ?? target} ${ctcp.slice('ACTION '.length)}`
    : isDirectCtcp
      ? `<${ctcp}>`
      : payload;
  emitMessage(connection, createMessage(connection, {
    target,
    nick,
    body,
    kind: command === 'NOTICE' ? 'notice' : 'line',
    self: isSameIrcIdentifier(nick, connection.currentNick),
  }));
};

const handleJoin = (connection: IrcConnectionState, params: string[], nick: string | null) => {
  const name = (params[0] ?? params[1] ?? '').replace(/^:/, '');
  if (!name) {
    return;
  }
  const selfJoin = isSameIrcIdentifier(nick, connection.currentNick);
  if (!selfJoin && !resolveTrackedChannel(connection, name)) {
    return;
  }
  const users = connection.updateChannelUsers(name, nick, true);
  const channel = resolveTrackedChannel(connection, name) ?? name;
  emitMessage(connection, createMessage(connection, {
    target: channel,
    nick,
    body: `${nick ?? 'Someone'} joined ${channel}`,
    kind: 'join',
    self: selfJoin,
  }));
  emitChannel(connection, channel, { users });
};

const handlePart = (connection: IrcConnectionState, params: string[], nick: string | null) => {
  const channel = resolveTrackedChannel(connection, params[0] ?? '');
  if (!channel) {
    return;
  }
  const reason = params[1] ?? 'left';
  const selfPart = isSameIrcIdentifier(nick, connection.currentNick);
  if (!selfPart && !resolveTrackedChannel(connection, channel)) {
    return;
  }
  const users = selfPart ? [] : connection.updateChannelUsers(channel, nick, false);
  if (selfPart) {
    connection.channelUsers.delete(channel);
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

const handleKick = (connection: IrcConnectionState, params: string[], nick: string | null) => {
  const channel = resolveTrackedChannel(connection, params[0] ?? '');
  const kickedNick = params[1] ?? '';
  if (!channel || !kickedNick || !resolveTrackedChannel(connection, channel)) {
    return;
  }
  const selfKick = isSameIrcIdentifier(kickedNick, connection.currentNick);
  const reason = params[2] ?? 'kicked';
  const users = selfKick ? [] : connection.updateChannelUsers(channel, kickedNick, false);
  if (selfKick) {
    connection.channelUsers.delete(channel);
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

const handleQuit = (connection: IrcConnectionState, params: string[], nick: string | null) => {
  emitStatus(connection, `${nick ?? 'Someone'} quit (${params[0] ?? 'quit'})`);
  for (const [channel, users] of connection.channelUsers) {
    const existingNick = nick ? findIrcCaseMatch(users, nick) : null;
    if (existingNick && users.delete(existingNick)) {
      emitChannel(connection, channel, { users: Array.from(users) });
    }
  }
};

const handleNick = (connection: IrcConnectionState, params: string[], nick: string | null) => {
  const newNick = params[0] ?? '';
  if (!newNick) {
    return;
  }
  for (const [channel, users] of connection.channelUsers) {
    const existingNick = nick ? findIrcCaseMatch(users, nick) : null;
    if (existingNick && users.delete(existingNick)) {
      users.add(newNick);
      emitChannel(connection, channel, { users: Array.from(users) });
    }
  }
  if (isSameIrcIdentifier(nick, connection.currentNick) || isSameIrcIdentifier(nick, connection.pendingNick)) {
    connection.currentNick = newNick;
    connection.pendingNick = null;
    emitState(connection);
  }
  emitStatus(connection, `${nick ?? 'Someone'} is now known as ${newNick}`);
};

const handleTopic = (connection: IrcConnectionState, params: string[]) => {
  const channel = resolveTrackedChannel(connection, params[0] ?? '');
  if (!channel) {
    return;
  }
  emitChannel(connection, channel, { topic: params[1] ?? '' });
  emitStatus(connection, `Topic for ${channel} changed`);
};

const createMessage = (
  connection: IrcConnectionState,
  input: Omit<MessageInput, 'id' | 'networkId' | 'ts'>
): MessageInput => ({
  id: randomUUID(),
  networkId: connection.profile.id,
  ts: Date.now(),
  ...input,
});

const resolveTrackedChannel = (connection: IrcConnectionState, channel: string) =>
  channel ? findIrcCaseMatch(connection.channelUsers.keys(), channel) ?? null : null;
