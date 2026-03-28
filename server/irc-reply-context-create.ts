import { isChannelTarget } from './irc-parser.js';
import { type ChannelReplyOperation, type PendingReplyContext, replyContextTtlMs } from './irc-reply-context-types.js';

export const createMessageReplyContext = (
  sourceTarget: string,
  target: string,
  optimisticMessageId?: string
): PendingReplyContext => ({
  kind: 'message',
  sourceTarget,
  target,
  optimisticMessageId,
  expiresAt: Date.now() + replyContextTtlMs,
});

export const createWhoisReplyContext = (sourceTarget: string, nick: string): PendingReplyContext => ({
  kind: 'whois',
  sourceTarget,
  nick,
  expiresAt: Date.now() + replyContextTtlMs,
});

export const createRawTargetReplyContext = (
  sourceTarget: string,
  command: 'MODE',
  target: string
): PendingReplyContext => ({
  kind: 'raw-target',
  sourceTarget,
  command,
  target,
  expiresAt: Date.now() + replyContextTtlMs,
});

export const createRawListReplyContext = (sourceTarget: string): PendingReplyContext => ({
  kind: 'raw-list',
  sourceTarget,
  expiresAt: Date.now() + replyContextTtlMs,
});

export const createChannelListReplyContext = (requestId: string): PendingReplyContext => ({
  kind: 'channel-list',
  requestId,
  expiresAt: Number.POSITIVE_INFINITY,
});

export const createChannelReplyContext = (
  sourceTarget: string,
  channel: string,
  operation: ChannelReplyOperation,
  options: { failedJoinBufferId?: string; requestedTopic?: string } = {}
): PendingReplyContext => ({
  kind: 'channel',
  sourceTarget,
  channel,
  operation,
  failedJoinBufferId: options.failedJoinBufferId,
  requestedTopic: options.requestedTopic,
  expiresAt: Date.now() + replyContextTtlMs,
});

export const createNickReplyContext = (sourceTarget: string, requestedNick: string): PendingReplyContext => ({
  kind: 'nick',
  sourceTarget,
  requestedNick,
  expiresAt: Date.now() + replyContextTtlMs,
});

export const createIsonReplyContext = (sourceTarget: string): PendingReplyContext => ({
  kind: 'ison',
  sourceTarget,
  expiresAt: Date.now() + replyContextTtlMs,
});

export const createFriendPresenceIsonReplyContext = (
  snapshotId: number,
): PendingReplyContext => ({
  kind: 'friend-presence-ison',
  snapshotId,
  expiresAt: Date.now() + replyContextTtlMs,
});

export const createReplyContextFromRaw = (sourceTarget: string, raw: string): PendingReplyContext | null => {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  const [commandToken = '', ...rest] = trimmed.split(/\s+/);
  const command = commandToken.toUpperCase();
  if ((command === 'PRIVMSG' || command === 'NOTICE') && rest[0]) {
    return createMessageReplyContext(sourceTarget, rest[0]);
  }
  if (command === 'WHOIS') {
    return rest.at(-1) ? createWhoisReplyContext(sourceTarget, rest.at(-1) as string) : null;
  }
  if (command === 'ISON') {
    return createIsonReplyContext(sourceTarget);
  }
  if (command === 'LIST') {
    return createRawListReplyContext(sourceTarget);
  }
  if (command === 'TOPIC' && rest[0]) {
    return createChannelReplyContext(
      rest.length === 1 ? 'server' : sourceTarget,
      rest[0],
      rest.length === 1 ? 'topic-query' : 'topic-set',
      rest.length === 1 ? {} : { requestedTopic: rest.slice(1).join(' ').replace(/^:/, '') }
    );
  }
  if ((command === 'JOIN' || command === 'PART') && rest[0]) {
    return createChannelReplyContext(sourceTarget, rest[0], command.toLowerCase() as 'join' | 'part');
  }
  if (command === 'MODE' && rest[0] && !isChannelTarget(rest[0])) {
    return createRawTargetReplyContext('server', 'MODE', rest[0]);
  }
  if (command === 'NAMES' && rest[0] && isChannelTarget(rest[0])) {
    return createChannelReplyContext('server', rest[0], 'names');
  }
  if (command === 'NICK' && rest[0]) {
    return createNickReplyContext(sourceTarget, rest[0]);
  }
  return null;
};
