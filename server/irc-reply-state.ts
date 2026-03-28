import { getChannelListSession } from './irc-channel-list-state.js';
import type { IrcReplyStateContext } from './irc-contexts.js';
import type { PendingReplyContext } from './irc-reply-context-types.js';

type ReplyTrackerContext = Pick<IrcReplyStateContext, 'replyTracker'>;

export const queueReplyContext = (connection: ReplyTrackerContext, context: PendingReplyContext) => {
  connection.replyTracker.queue(context);
};

export const consumeReplyTarget = (
  connection: IrcReplyStateContext,
  command: string,
  params: string[],
  nick: string | null,
  rawTarget?: string,
  label?: string | null
) => {
  prunePendingReplyContexts(connection);
  return connection.replyTracker.consumeReplyTarget(command, params, nick, rawTarget, label);
};

export const consumeReplyContext = (
  connection: IrcReplyStateContext,
  command: string,
  params: string[],
  nick: string | null,
  rawTarget?: string,
  label?: string | null
) => {
  prunePendingReplyContexts(connection);
  return connection.replyTracker.consumeReplyContext(command, params, nick, rawTarget, label);
};

export const discardPendingChannelReplyContexts = (
  connection: ReplyTrackerContext,
  channel: string,
  predicate?: (context: Extract<PendingReplyContext, { kind: 'channel' }>) => boolean
) => connection.replyTracker.discardPendingChannelReplyContexts(channel, predicate);

export const consumePendingNickReplyContexts = (connection: ReplyTrackerContext, requestedNick: string) =>
  connection.replyTracker.consumePendingNickReplyContexts(requestedNick);

export const discardPendingNickReplyContexts = (connection: ReplyTrackerContext) =>
  connection.replyTracker.discardPendingNickReplyContexts();

export const prunePendingReplyContexts = (connection: IrcReplyStateContext) => {
  const now = Date.now();
  connection.replyTracker.prune();
  const session = getChannelListSession(connection.channelList);
  if (session.phase === 'draining' && session.expiresAt < now) {
    connection.clearDrainingChannelList();
  }
};
