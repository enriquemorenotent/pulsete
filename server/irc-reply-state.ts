import type { PendingReplyContext } from './irc-reply-context.js';
import type { IrcConnection } from './irc.js';

export const queueReplyContext = (connection: IrcConnection, context: PendingReplyContext) => {
  connection.replyTracker.queue(context);
};

export const consumeReplyTarget = (
  connection: IrcConnection,
  command: string,
  params: string[],
  nick: string | null,
  rawTarget?: string
) => {
  prunePendingReplyContexts(connection);
  return connection.replyTracker.consumeReplyTarget(command, params, nick, rawTarget);
};

export const consumeReplyContext = (
  connection: IrcConnection,
  command: string,
  params: string[],
  nick: string | null,
  rawTarget?: string
) => {
  prunePendingReplyContexts(connection);
  return connection.replyTracker.consumeReplyContext(command, params, nick, rawTarget);
};

export const discardPendingChannelReplyContexts = (
  connection: IrcConnection,
  channel: string,
  predicate?: (context: Extract<PendingReplyContext, { kind: 'channel' }>) => boolean
) => connection.replyTracker.discardPendingChannelReplyContexts(channel, predicate);

export const consumePendingNickReplyContexts = (connection: IrcConnection, requestedNick: string) =>
  connection.replyTracker.consumePendingNickReplyContexts(requestedNick);

export const discardPendingNickReplyContexts = (connection: IrcConnection) =>
  connection.replyTracker.discardPendingNickReplyContexts();

export const prunePendingReplyContexts = (connection: IrcConnection) => {
  const now = Date.now();
  connection.replyTracker.prune();
  if (
    connection.channelList.draining.mode
    && connection.channelList.draining.expiresAt !== null
    && connection.channelList.draining.expiresAt < now
  ) {
    connection.clearDrainingChannelList();
  }
};
