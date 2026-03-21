import type { PendingReplyContext } from './irc-reply-context.js';
import type { ReplyTracker } from './irc-reply-tracker.js';
import type {
  Handlers,
  IrcChannelListState,
  IrcChannelTrackingState,
  IrcConnectionState,
  IrcFriendPresenceState,
  IrcLifecycleState,
  IrcSocket,
} from './irc-types.js';
import type { RuntimeNetworkProfile } from './storage-types.js';

export type IrcEventContext = {
  handlers: Handlers;
  profile: RuntimeNetworkProfile;
};

export type IrcStateContext = IrcEventContext & {
  lifecycle: IrcLifecycleState;
};

export type IrcChannelListContext = IrcStateContext & {
  channelList: IrcChannelListState;
  isChannelListPending(): boolean;
  prunePendingReplyContexts(): void;
  sendRaw(raw: string, statusTarget?: string): boolean;
};

export type IrcChannelStateContext = IrcEventContext & {
  channels: IrcChannelTrackingState;
  profile: RuntimeNetworkProfile;
  prunePendingReplyContexts(): void;
  replyTracker: ReplyTracker;
};

export type IrcFriendPresenceContext = IrcStateContext & {
  friendPresence: IrcFriendPresenceState;
  queueReplyContext(context: PendingReplyContext): void;
  sendRaw(raw: string, statusTarget?: string): boolean;
};

export type IrcReplyStateContext = {
  channelList: IrcChannelListState;
  clearDrainingChannelList(): void;
  replyTracker: ReplyTracker;
};

export type IrcRawIoContext = IrcStateContext;

export type IrcClientIoContext = IrcStateContext & {
  getChannelListRequestFailureMessage(): string;
  isChannelListPending(): boolean;
  join(channel: string, sourceTarget?: string, options?: { visiblePending?: boolean }): boolean;
  part(channel: string, reason?: string, sourceTarget?: string): boolean;
  prunePendingReplyContexts(): void;
  queueReplyContext(context: PendingReplyContext): void;
  startChannelList(mode: 'raw' | 'structured', options: { requestId?: string; sourceTarget?: string }): void;
};

export type IrcLifecycleContext = IrcChannelListContext & {
  channels: IrcChannelTrackingState;
  friendPresence: IrcFriendPresenceState;
  pendingNick: string | null;
  queueReplyContext(context: PendingReplyContext): void;
  replyTracker: ReplyTracker;
  clearConnectDeadlineTimer(): void;
  clearReconnectTimer(): void;
  connect(resetRetryBudget?: boolean): void;
  setNick(nick: string, sourceTarget?: string): boolean;
};

export type IrcConnectContext = IrcLifecycleContext & Pick<
  IrcConnectionState,
  'beginLogin' | 'consume' | 'handleSocketClosed' | 'markConnectionFailure' | 'openSocket' | 'setConnectDeadlineTimer'
> & {
  openSocket(socket: IrcSocket): void;
};
