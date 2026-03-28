import type net from 'node:net';
import type tls from 'node:tls';
import type {
  ChannelListEntry,
  ChannelUserState,
  PresenceStatus,
} from '../shared/protocol.js';
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

export type IrcSaslPhase =
  | 'idle'
  | 'awaiting-cap-list'
  | 'awaiting-cap-ack'
  | 'awaiting-authenticate-challenge'
  | 'awaiting-authenticate-result'
  | 'completed';

export type IrcSaslState = {
  phase: IrcSaslPhase;
  capabilityAdvertised: boolean;
  capEndSent: boolean;
};

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
  sasl: IrcSaslState;
  pendingNickservAutoJoinTarget: string | null;
};

export type IrcChannelTrackingState = {
  users: Map<string, ChannelUserState[]>;
  sessions: Map<string, ChannelSessionState>;
  reconnectChannels: Set<string>;
  joinTimeoutMs: number;
};

export type FriendPresencePollState = {
  id: number;
  remainingReplies: number;
  presenceByKey: Map<string, PresenceStatus>;
  requestedNickKeys: Set<string>;
};

export type IrcFriendPresenceState = {
  nicks: string[];
  presenceByKey: Map<string, PresenceStatus>;
  resolvedNicks: Set<string>;
  snapshotByKey: Map<string, PresenceStatus>;
  timer: ReturnType<typeof setInterval> | null;
  pendingPoll: FriendPresencePollState | null;
  nextPollId: number;
  enabled: boolean;
};

export type IrcChannelListMode = 'raw' | 'structured';

export type IrcChannelListSession =
  | { phase: 'idle' }
  | {
      phase: 'active';
      mode: 'structured';
      sourceTarget: null;
      requestId: string | null;
      entries: ChannelListEntry[];
    }
  | {
      phase: 'active';
      mode: 'raw';
      sourceTarget: string;
      requestId: null;
      entries: ChannelListEntry[];
    }
  | {
      phase: 'draining';
      mode: 'structured';
      sourceTarget: null;
      requestId: string | null;
      expiresAt: number;
    }
  | {
      phase: 'draining';
      mode: 'raw';
      sourceTarget: string;
      requestId: null;
      expiresAt: number;
    };

export type IrcChannelListActiveState = Extract<IrcChannelListSession, { phase: 'active' }>;

export type IrcChannelListDrainingState = Extract<IrcChannelListSession, { phase: 'draining' }>;

export type IrcChannelListState = {
  session: IrcChannelListSession;
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
