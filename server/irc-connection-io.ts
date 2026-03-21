import { randomUUID } from 'node:crypto';
import { emitStatus } from './irc-emit.js';
import { handleIrcLine } from './irc-handle-line.js';
import { maxBufferedIrcBytes, maxIrcCommandBytes } from './irc-limits.js';
import { createReplyContextFromRaw, type PendingReplyContext } from './irc-reply-context.js';
import type { IrcConnection } from './irc.js';
import type { MessageInput } from './storage.js';

export const sendRaw = (connection: IrcConnection, raw: string, statusTarget?: string) => {
  if (!connection.socket) {
    emitStatus(connection, 'Not connected', 'error', statusTarget);
    return false;
  }
  if (Buffer.byteLength(raw, 'utf8') > maxIrcCommandBytes) {
    emitStatus(connection, `IRC command exceeds the ${maxIrcCommandBytes}-byte limit`, 'error', statusTarget);
    return false;
  }
  try {
    connection.socket.write(`${raw}\r\n`);
  } catch {
    connection.lastFailureMessage = 'Connection is no longer writable';
    emitStatus(connection, connection.lastFailureMessage, 'error', statusTarget);
    connection.socket.destroy();
    return false;
  }
  return true;
};

export const sendClientRaw = (connection: IrcConnection, raw: string, sourceTarget = 'server'): boolean => {
  connection.prunePendingReplyContexts();
  const trimmed = raw.trim();
  const [commandToken = '', ...rest] = trimmed.split(/\s+/);
  const command = commandToken.toUpperCase();
  if (command === 'JOIN' && rest[0]) {
    return connection.join(rest[0], sourceTarget, { visiblePending: true });
  }
  if (command === 'PART' && rest[0]) {
    return connection.part(rest[0], rest.slice(1).join(' ').replace(/^:/, '') || 'Leaving', sourceTarget);
  }
  const replyContext = createReplyContextFromRaw(sourceTarget, raw);
  if (command === 'LIST') {
    if (connection.isChannelListPending()) {
      emitStatus(connection, connection.getChannelListRequestFailureMessage(), 'error', sourceTarget);
      return false;
    }
    if (!connection.connected) {
      emitStatus(connection, connection.socket ? 'Still connecting to server' : 'Not connected', 'error', sourceTarget);
      return false;
    }
    if (!sendRaw(connection, raw, sourceTarget)) {
      return false;
    }
    connection.startChannelList('raw', { sourceTarget });
    return true;
  }
  return sendTrackedRaw(connection, raw, sourceTarget, replyContext);
};

export const consume = (connection: IrcConnection, chunk: string) => {
  connection.buffer += chunk;
  let newlineIndex = connection.buffer.indexOf('\n');
  while (newlineIndex !== -1) {
    const line = connection.buffer.slice(0, newlineIndex).replace(/\r$/, '');
    connection.buffer = connection.buffer.slice(newlineIndex + 1);
    if (Buffer.byteLength(line, 'utf8') > maxBufferedIrcBytes) {
      handleOversizedServerLine(connection);
      return;
    }
    if (line.length > 0) {
      handleIrcLine(connection, line);
    }
    newlineIndex = connection.buffer.indexOf('\n');
  }
  if (Buffer.byteLength(connection.buffer, 'utf8') > maxBufferedIrcBytes) {
    handleOversizedServerLine(connection);
  }
};

export const createSelfMessage = (connection: IrcConnection, target: string, body: string): MessageInput => ({
  id: randomUUID(),
  networkId: connection.profile.id,
  target,
  nick: connection.currentNick,
  body,
  kind: 'line',
  self: true,
  ts: Date.now(),
});

export const sendTrackedRaw = (
  connection: IrcConnection,
  raw: string,
  sourceTarget: string,
  replyContext: PendingReplyContext | null
) => {
  if (!connection.connected) {
    emitStatus(connection, connection.socket ? 'Still connecting to server' : 'Not connected', 'error', sourceTarget);
    return false;
  }
  if (!sendRaw(connection, raw, sourceTarget)) {
    return false;
  }
  if (replyContext) {
    connection.queueReplyContext(replyContext);
  }
  return true;
};

const handleOversizedServerLine = (connection: IrcConnection) => {
  connection.buffer = '';
  connection.lastFailureMessage = 'Server sent an oversized IRC line';
  emitStatus(connection, connection.lastFailureMessage, 'error');
  connection.socket?.destroy();
};
