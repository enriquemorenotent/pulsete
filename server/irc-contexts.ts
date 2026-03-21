import type { PendingReplyContext } from './irc-reply-context-types.js';
import type {
  Handlers,
  IrcChannelListState,
  IrcChannelTrackingState,
  IrcConnectionState,
  IrcFriendPresenceState,
  IrcLifecycleState,
  IrcReplyTracker,
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

export type IrcReplyStateContext = {
  channelList: IrcChannelListState;
  clearDrainingChannelList(): void;
  replyTracker: IrcReplyTracker;
};

export type IrcChannelListContext = IrcStateContext & IrcReplyStateContext & {
  isChannelListPending(): boolean;
  prunePendingReplyContexts(): void;
  sendRaw(raw: string, statusTarget?: string): boolean;
};

export type IrcChannelStateContext = IrcEventContext & {
  channels: IrcChannelTrackingState;
  profile: RuntimeNetworkProfile;
  prunePendingReplyContexts(): void;
  replyTracker: IrcReplyTracker;
};

export type IrcFriendPresenceContext = IrcStateContext & {
  friendPresence: IrcFriendPresenceState;
  replyTracker: IrcReplyTracker;
  queueReplyContext(context: PendingReplyContext): void;
  sendRaw(raw: string, statusTarget?: string): boolean;
};

export type IrcRawIoContext = IrcStateContext;

export type IrcClientIoContext = IrcStateContext & IrcReplyStateContext & {
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
  replyTracker: IrcReplyTracker;
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
