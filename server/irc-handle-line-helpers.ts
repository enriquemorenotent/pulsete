import { randomUUID } from 'node:crypto';
import { isSameIrcIdentifier } from './irc-parser.js';
import type { IrcConnectionData } from './irc-types.js';
import { resolveRuntimeMessageAttribution } from './message-attribution.js';
import type { MessageInput } from './storage-types.js';

type IrcNickIdentityContext = Pick<IrcConnectionData, 'lifecycle' | 'profile' | 'replyTracker'>;
type IrcMessageContext = Pick<IrcConnectionData, 'profile'>;

export const isSelfNick = (connection: IrcNickIdentityContext, nick: string | null) =>
  isSameIrcIdentifier(nick, connection.lifecycle.currentNick)
  || isSameIrcIdentifier(nick, connection.replyTracker.pendingNick);

export const createMessage = (
  connection: IrcMessageContext,
  input: Omit<MessageInput, 'id' | 'networkId' | 'ts'> & { ts?: number }
): MessageInput => {
  const message: MessageInput = {
    id: randomUUID(),
    networkId: connection.profile.id,
    ...input,
    ts: input.ts ?? Date.now(),
  };
  return {
    ...message,
    ...resolveRuntimeMessageAttribution(message),
  };
};

export const formatPingReply = (line: string, params: string[]) => {
  if (/^PING\b/i.test(line)) {
    return line.replace(/^PING\b/i, 'PONG');
  }
  if (params.length === 0) {
    return 'PONG';
  }
  return params.length === 1 ? `PONG :${params[0]}` : `PONG ${params.join(' ')}`;
};
