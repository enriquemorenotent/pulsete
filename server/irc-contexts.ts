import type { IrcConnectionData, IrcConnectionMethods } from './irc-types.js';

type IrcConnectionPick<
  TData extends keyof IrcConnectionData = never,
  TMethods extends keyof IrcConnectionMethods = never,
> = Pick<IrcConnectionData, TData> & Pick<IrcConnectionMethods, TMethods>;

export type IrcEventContext = IrcConnectionPick<'handlers' | 'profile'>;

export type IrcStateContext = IrcEventContext & IrcConnectionPick<'lifecycle'>;

export type IrcReplyStateContext = IrcConnectionPick<'channelList' | 'replyTracker', 'clearDrainingChannelList'>;

export type IrcChannelListContext = IrcEventContext & IrcConnectionPick<
  'channelList' | 'lifecycle',
  'prunePendingReplyContexts' | 'sendRaw'
>;

export type IrcChannelStateContext = IrcEventContext & IrcConnectionPick<
  'channels' | 'replyTracker',
  'prunePendingReplyContexts'
>;

export type IrcChannelEventContext = IrcEventContext & IrcConnectionPick<
  'lifecycle' | 'replyTracker',
  | 'confirmNick'
  | 'discardPendingChannelReplyContexts'
  | 'getChannelSession'
  | 'getTrackedChannelUserEntries'
  | 'getTrackedChannelUsers'
  | 'handleSelfChannelDeparture'
  | 'removeChannelSession'
  | 'resolveTrackedChannel'
  | 'setChannelSession'
  | 'setTrackedChannelUsers'
  | 'updateChannelUsers'
>;

export type IrcFriendPresenceContext = IrcEventContext & IrcConnectionPick<
  'friendPresence' | 'lifecycle',
  'queueReplyContext' | 'sendRaw'
>;

export type IrcRawIoContext = IrcEventContext & IrcConnectionPick<'lifecycle'>;

export type IrcClientIoContext = IrcRawIoContext & IrcConnectionPick<
  never,
  | 'getChannelListRequestFailureMessage'
  | 'isChannelListPending'
  | 'join'
  | 'part'
  | 'prunePendingReplyContexts'
  | 'queueReplyContext'
  | 'startChannelList'
>;

export type IrcMessageEventContext = IrcEventContext & IrcConnectionPick<
  'lifecycle' | 'replyTracker',
  'consumeReplyTarget' | 'join' | 'resolveTrackedChannel'
>;

export type IrcLifecycleContext = IrcEventContext & IrcConnectionPick<
  'channelList' | 'channels' | 'friendPresence' | 'lifecycle' | 'replyTracker',
  'clearDrainingChannelList' | 'connect' | 'prunePendingReplyContexts' | 'queueReplyContext' | 'sendRaw'
>;

export type IrcConnectContext = IrcLifecycleContext & IrcConnectionPick<
  never,
  | 'beginLogin'
  | 'clearReconnectTimer'
  | 'consume'
  | 'handleSocketClosed'
  | 'markConnectionFailure'
  | 'openSocket'
  | 'setConnectDeadlineTimer'
  | 'setNick'
>;

export type IrcRegistrationContext = IrcEventContext & IrcConnectionPick<
  'lifecycle' | 'profile' | 'replyTracker',
  | 'applyNickFallback'
  | 'clearPendingNick'
  | 'consumeReplyContext'
  | 'join'
  | 'markRegistered'
  | 'refreshFriendPresence'
  | 'sendRaw'
>;
