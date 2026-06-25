import type net from 'node:net';
import type tls from 'node:tls';
import type { ChannelListEntry, ChannelUserState, PresenceStatus } from '../shared/protocol-chat.js';
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
  offeredCapabilities: Set<string>;
  pendingCapabilities: Set<string>;
};

export type IrcCapabilityState = {
  offered: Set<string>;
  negotiated: Set<string>;
  pendingRequest: Set<string>;
  batchLabelById: Map<string, string>;
  nextLabelId: number;
};

export type IrcHeartbeatState = {
  timer: ReturnType<typeof setTimeout> | null;
  awaitingActivity: boolean;
  idleMs: number;
  timeoutMs: number;
};

export type IrcLifecycleState = {
  socket: IrcSocket | null;
  buffer: string;
  connectDeadlineTimer: ReturnType<typeof setTimeout> | null;
  heartbeat: IrcHeartbeatState;
  manualDisconnect: boolean;
  reconnectAttempts: number;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  connected: boolean;
  serverName: string | null;
  currentNick: string;
  profileNickSyncTarget: string | null;
  lastFailureMessage: string | null;
  sasl: IrcSaslState;
  capabilities: IrcCapabilityState;
  accountName: string | null;
  pendingNickservAutoJoinTarget: string | null;
};

export type IrcChannelTrackingState = {
  users: Map<string, ChannelUserState[]>;
  sessions: Map<string, ChannelSessionState>;
  reconnectChannels: Set<string>;
  joinTimeoutMs: number;
};

export type FriendPresenceTransportMode = 'monitor' | 'ison';

export type FriendPresenceIsonSnapshotState = {
  id: number;
  remainingReplies: number;
  onlineNickKeys: Set<string>;
  requestedNickKeys: Set<string>;
};

export type IrcFriendPresenceState = {
  nicks: string[];
  presenceByKey: Map<string, PresenceStatus>;
  resolvedNicks: Set<string>;
  snapshotByKey: Map<string, PresenceStatus>;
  timer: ReturnType<typeof setInterval> | null;
  pendingIsonSnapshot: FriendPresenceIsonSnapshotState | null;
  nextSnapshotId: number;
  enabled: boolean;
  monitorSupported: boolean;
  monitorLimit: number | null;
  activeTransport: FriendPresenceTransportMode | null;
  registeredMonitorNicks: Map<string, string>;
};

export type IrcChannelListMode = 'raw' | 'structured';

export type IrcChannelListSnapshot = {
  requestId: string;
  entries: ChannelListEntry[];
  totalEntries: number;
  truncated: boolean;
};

export type IrcChannelListSession =
  | { phase: 'idle' }
  | {
      phase: 'active';
      mode: 'structured';
      sourceTarget: null;
      requestId: string | null;
      entries: ChannelListEntry[];
      totalEntries: number;
      truncated: boolean;
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
  consumeReplyTarget(
    command: string,
    params: string[],
    nick: string | null,
    rawTarget?: string,
    label?: string | null
  ): string | null;
  consumeReplyContext(
    command: string,
    params: string[],
    nick: string | null,
    rawTarget?: string,
    label?: string | null
  ): PendingReplyContext | null;
  discardPendingChannelReplyContexts(
    channel: string,
    predicate?: (context: Extract<PendingReplyContext, { kind: 'channel' }>) => boolean
  ): Array<Extract<PendingReplyContext, { kind: 'channel' }>>;
  consumePendingNickReplyContexts(requestedNick: string): Array<Extract<PendingReplyContext, { kind: 'nick' }>>;
  discardPendingNickReplyContexts(): Array<Extract<PendingReplyContext, { kind: 'nick' }>>;
};
