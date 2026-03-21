import { randomUUID } from 'node:crypto';
import { isSameIrcIdentifier } from './irc-parser.js';
import type { IrcConnectionState } from './irc-types.js';
import type { MessageInput } from './storage-types.js';

export const isSelfNick = (connection: IrcConnectionState, nick: string | null) =>
  isSameIrcIdentifier(nick, connection.lifecycle.currentNick)
  || isSameIrcIdentifier(nick, connection.replyTracker.pendingNick);

export const createMessage = (
  connection: IrcConnectionState,
  input: Omit<MessageInput, 'id' | 'networkId' | 'ts'>
): MessageInput => ({
  id: randomUUID(),
  networkId: connection.profile.id,
  ts: Date.now(),
  ...input,
});

export const formatPingReply = (line: string, params: string[]) => {
  if (/^PING\b/i.test(line)) {
    return line.replace(/^PING\b/i, 'PONG');
  }
  if (params.length === 0) {
    return 'PONG';
  }
  return params.length === 1 ? `PONG :${params[0]}` : `PONG ${params.join(' ')}`;
};
