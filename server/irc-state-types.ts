import type net from 'node:net';
import type tls from 'node:tls';
import type { ChannelListEntry, ChannelUserState } from '../shared/protocol.js';
import type { PendingReplyContext } from './irc-reply-context-types.js';

export type ChannelSessionPhase = 'joining' | 'joined' | 'leaving';

export type ChannelSessionState = {
  channel: string;
  phase: ChannelSessionPhase;
  sourceTarget: string;
  visiblePending: boolean;
  previouslyJoined: boolean;
  joinTimeoutTimer: ReturnType<typeof setTimeout> | null;
};

export type IrcSocket = net.Socket | tls.TLSSocket;

export type IrcLifecycleState = {
  socket: IrcSocket | null;
  buffer: string;
  connectDeadlineTimer: ReturnType<typeof setTimeout> | null;
  manualDisconnect: boolean;
  reconnectAttempts: number;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  connected: boolean;
  serverName: string | null;
  currentNick: string;
  lastFailureMessage: string | null;
};

export type IrcChannelTrackingState = {
  users: Map<string, ChannelUserState[]>;
  sessions: Map<string, ChannelSessionState>;
  joinTimeoutMs: number;
};

export type FriendPresencePollState = {
  id: number;
  remainingResponses: number;
  onlineNicks: string[];
};

export type IrcFriendPresenceState = {
  nicks: string[];
  onlineKeys: Set<string>;
  timer: ReturnType<typeof setInterval> | null;
  pendingPoll: FriendPresencePollState | null;
  nextPollId: number;
  enabled: boolean;
};

export type IrcChannelListMode = 'raw' | 'structured';

export type IrcChannelListActiveState = {
  mode: IrcChannelListMode | null;
  sourceTarget: string | null;
  requestId: string | null;
  entries: ChannelListEntry[];
};

export type IrcChannelListDrainingState = {
  mode: IrcChannelListMode | null;
  sourceTarget: string | null;
  requestId: string | null;
  expiresAt: number | null;
};

export type IrcChannelListState = {
  active: IrcChannelListActiveState;
  draining: IrcChannelListDrainingState;
  timeoutTimer: ReturnType<typeof setTimeout> | null;
  timeoutMs: number;
  drainGraceMs: number;
};

export type IrcReplyTracker = {
  pendingNick: string | null;
  pendingReplyContexts: readonly PendingReplyContext[];
  setPendingNick(value: string | null): void;
  clearPendingNick(): void;
  reset(): void;
  prune(): void;
  queue(context: PendingReplyContext): void;
  consumeReplyTarget(command: string, params: string[], nick: string | null, rawTarget?: string): string | null;
  consumeReplyContext(command: string, params: string[], nick: string | null, rawTarget?: string): PendingReplyContext | null;
  discardPendingChannelReplyContexts(
    channel: string,
    predicate?: (context: Extract<PendingReplyContext, { kind: 'channel' }>) => boolean
  ): Array<Extract<PendingReplyContext, { kind: 'channel' }>>;
  consumePendingNickReplyContexts(requestedNick: string): Array<Extract<PendingReplyContext, { kind: 'nick' }>>;
  discardPendingNickReplyContexts(): Array<Extract<PendingReplyContext, { kind: 'nick' }>>;
};
