import type net from 'node:net';
import type tls from 'node:tls';
import type { ChannelListEntry, ChannelUserState, NetworkRuntimeState } from '../shared/protocol.js';
import type { MessageInput } from './storage.js';
import type { PendingReplyContext } from './irc-reply-context.js';
import type { ReplyTracker } from './irc-reply-tracker.js';
import type { RuntimeNetworkProfile } from './storage-types.js';

export type ChannelSessionPhase = 'joining' | 'joined' | 'leaving';

export type ChannelSessionState = {
  channel: string;
  phase: ChannelSessionPhase;
  sourceTarget: string;
  visiblePending: boolean;
  previouslyJoined: boolean;
  joinTimeoutTimer: ReturnType<typeof setTimeout> | null;
};

export type RuntimeEvent =
  | { type: 'state'; networkId: string; phase: NetworkRuntimeState['phase']; serverName: string | null; nick: string }
  | {
      type: 'status';
      networkId: string;
      message: string;
      kind: 'notice' | 'error' | 'system';
      target?: string;
      requireBoundTarget?: boolean;
    }
  | { type: 'channel-pending'; networkId: string; channel: string }
  | { type: 'channel-pending-remove'; networkId: string; channel: string }
  | {
      type: 'channel-list-entry';
      networkId: string;
      requestId: string;
      entry: { name: string; users: number; topic: string };
    }
  | { type: 'channel-list-completed'; networkId: string; requestId: string }
  | { type: 'channel-list-failed'; networkId: string; requestId: string; message: string }
  | { type: 'message'; message: MessageInput }
  | { type: 'friend-presence'; networkId: string; onlineNicks: string[] }
  | { type: 'channel'; networkId: string; channel: string; topic?: string; users?: ChannelUserState[] };

export type Handlers = {
  onEvent: (event: RuntimeEvent) => void;
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

type IrcChannelListMode = 'raw' | 'structured';

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

export type ParsedLine = {
  prefix: string | null;
  command: string;
  params: string[];
};

export type IrcConnectionState = {
  profile: RuntimeNetworkProfile;
  handlers: Handlers;
  lifecycle: IrcLifecycleState;
  channels: IrcChannelTrackingState;
  friendPresence: IrcFriendPresenceState;
  channelList: IrcChannelListState;
  replyTracker: ReplyTracker;
  socket: IrcSocket | null;
  buffer: string;
  channelUsers: Map<string, ChannelUserState[]>;
  channelSessions: Map<string, ChannelSessionState>;
  connectDeadlineTimer: ReturnType<typeof setTimeout> | null;
  manualDisconnect: boolean;
  reconnectAttempts: number;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  connected: boolean;
  serverName: string | null;
  currentNick: string;
  activeChannelListRequestId: string | null;
  activeChannelListEntries: ChannelListEntry[];
  drainingChannelListRequestId: string | null;
  pendingNick: string | null;
  lastFailureMessage: string | null;
  pendingReplyContexts: readonly PendingReplyContext[];
  beginLogin(): void;
  clearConnectDeadlineTimer(): void;
  clearReconnectTimer(): void;
  disableFriendPresence(): void;
  connect(resetRetryBudget?: boolean): void;
  consume(chunk: string): void;
  consumeReplyContext(command: string, params: string[], nick: string | null, rawTarget?: string): PendingReplyContext | null;
  handleFriendPresence(pollId: number, onlineNicks: string[]): void;
  join(channel: string, sourceTarget?: string, options?: { visiblePending?: boolean }): boolean;
  consumeReplyTarget(command: string, params: string[], nick: string | null, rawTarget?: string): string | null;
  queueReplyContext(context: PendingReplyContext): void;
  refreshFriendPresence(): void;
  finishChannelListRequest(requestId: string): void;
  getChannelListRequestFailureMessage(): string;
  getActiveChannelListSnapshot(): { requestId: string; entries: ChannelListEntry[] } | null;
  handleChannelListNumeric(command: string, params: string[]): boolean;
  handleSelfChannelDeparture(channel: string): void;
  recordChannelListEntry(requestId: string, entry: ChannelListEntry): void;
  requestChannelList(requestId: string): boolean;
  resetTransientState(): void;
  markConnectionFailure(detail: string): void;
  markRegistered(serverName: string | null, nick: string | null): void;
  openSocket(socket: IrcSocket): void;
  handleSocketClosed(socket: IrcSocket): void;
  setConnectDeadlineTimer(timer: ReturnType<typeof setTimeout>): void;
  sendRaw(raw: string, statusTarget?: string): boolean;
  sendClientRaw(raw: string, sourceTarget?: string): boolean;
  setFriendNicks(nicks: string[]): void;
  clearExpiredChannelSessions(): void;
  clearPendingNick(): void;
  confirmNick(newNick: string): void;
  applyNickFallback(fallbackNick: string, options: { replyTarget?: string; updatePending: boolean }): void;
  getChannelSession(channel: string): ChannelSessionState | null;
  getTrackedChannelUserEntries(): Array<[string, ChannelUserState[]]>;
  getTrackedChannelUsers(channel: string): ChannelUserState[];
  listPendingChannels(): Array<{ networkId: string; channel: string }>;
  removeChannelSession(channel: string): ChannelSessionState | null;
  resolveTrackedChannel(channel: string): string | null;
  setChannelSession(
    channel: string,
    phase: ChannelSessionPhase,
    options?: { sourceTarget?: string; visiblePending?: boolean; previouslyJoined?: boolean }
  ): ChannelSessionState;
  setTrackedChannelUsers(channel: string, users: ChannelUserState[]): ChannelUserState[];
  discardPendingChannelReplyContexts(
    channel: string,
    predicate?: (context: Extract<PendingReplyContext, { kind: 'channel' }>) => boolean
  ): Array<Extract<PendingReplyContext, { kind: 'channel' }>>;
  consumePendingNickReplyContexts(requestedNick: string): Array<Extract<PendingReplyContext, { kind: 'nick' }>>;
  discardPendingNickReplyContexts(): Array<Extract<PendingReplyContext, { kind: 'nick' }>>;
  clearDrainingChannelList(): void;
  isChannelListPending(): boolean;
  startChannelList(mode: 'raw' | 'structured', options: { requestId?: string; sourceTarget?: string }): void;
  updateChannelUsers(channel: string, nick: string | null, joined: boolean): ChannelUserState[];
};
