import { randomUUID } from 'node:crypto';
import tls from 'node:tls';
import type { MessageInput } from './storage.js';
import { emitChannel, emitMessage, emitState, emitStatus } from './irc-emit.js';
import { formatServerNumeric } from './irc-server-log.js';
import { isChannelTarget, nickFromPrefix, normalizeChannelUser, parseLine, stripCtcp } from './irc-parser.js';
import type { IrcConnectionState } from './irc-types.js';

export const handleIrcLine = (connection: IrcConnectionState, line: string) => {
  const { prefix, command, params } = parseLine(line);
  const nick = nickFromPrefix(prefix);
  if (command === 'PING') {
    connection.sendRaw(`PONG ${params.join(' ')}`);
    return;
  }
  if (handleWelcome(connection, command, params, nick) || handleNickConflict(connection, command)) {
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
    const channel = params[1] ?? '';
    if (channel) {
      emitChannel(connection, channel, { topic: params[2] ?? '' });
    }
    return;
  }
  if (command === '353') {
    const channel = params[2] ?? '';
    if (channel) {
      const users = (params[3] ?? '').split(' ').map(normalizeChannelUser).filter(Boolean);
      connection.channelUsers.set(channel, new Set(users));
      emitChannel(connection, channel, { users });
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
  connection.currentNick = `${connection.currentNick}_`;
  connection.sendRaw(`NICK ${connection.currentNick}`);
  emitStatus(connection, `${connection.profile.nick} is already in use. Retrying with ${connection.currentNick}...`, 'notice');
  return true;
};

const handleTextMessage = (connection: IrcConnectionState, command: 'PRIVMSG' | 'NOTICE', params: string[], nick: string | null) => {
  const rawTarget = params[0] ?? 'server';
  const payload = params[1] ?? '';
  const ctcp = stripCtcp(payload);
  const isDirectTarget = rawTarget === connection.currentNick && !isChannelTarget(rawTarget);
  const isDirectCtcp = isDirectTarget && ctcp !== null && !ctcp.startsWith('ACTION ');
  const target = isDirectTarget ? (command === 'NOTICE' || isDirectCtcp ? 'server' : nick ?? rawTarget) : rawTarget;
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
    self: nick === connection.currentNick,
  }));
};

const handleJoin = (connection: IrcConnectionState, params: string[], nick: string | null) => {
  const name = (params[0] ?? params[1] ?? '').replace(/^:/, '');
  if (!name) {
    return;
  }
  const users = connection.updateChannelUsers(name, nick, true);
  emitMessage(connection, createMessage(connection, {
    target: name,
    nick,
    body: `${nick ?? 'Someone'} joined ${name}`,
    kind: 'join',
    self: nick === connection.currentNick,
  }));
  emitChannel(connection, name, { users });
};

const handlePart = (connection: IrcConnectionState, params: string[], nick: string | null) => {
  const channel = params[0] ?? '';
  if (!channel) {
    return;
  }
  const reason = params[1] ?? 'left';
  const users = connection.updateChannelUsers(channel, nick, false);
  emitMessage(connection, createMessage(connection, {
    target: channel,
    nick,
    body: `${nick ?? 'Someone'} left ${channel}${reason ? ` (${reason})` : ''}`,
    kind: 'part',
    self: nick === connection.currentNick,
  }));
  emitChannel(connection, channel, { users });
};

const handleQuit = (connection: IrcConnectionState, params: string[], nick: string | null) => {
  emitStatus(connection, `${nick ?? 'Someone'} quit (${params[0] ?? 'quit'})`);
  for (const [channel, users] of connection.channelUsers) {
    if (users.delete(nick ?? '')) {
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
    if (users.delete(nick ?? '')) {
      users.add(newNick);
      emitChannel(connection, channel, { users: Array.from(users) });
    }
  }
  if (nick === connection.currentNick) {
    connection.currentNick = newNick;
    emitState(connection);
  }
  emitStatus(connection, `${nick ?? 'Someone'} is now known as ${newNick}`);
};

const handleTopic = (connection: IrcConnectionState, params: string[]) => {
  const channel = params[0] ?? '';
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
