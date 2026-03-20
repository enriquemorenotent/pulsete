import type net from 'node:net';
import type tls from 'node:tls';
import type { ChannelListEntry, ChannelUserState } from '../shared/protocol.js';
import type { MessageInput } from './storage.js';
import type { PendingReplyContext } from './irc-reply-context.js';
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
  | { type: 'state'; networkId: string; connected: boolean; serverName: string | null; nick: string }
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

export type ParsedLine = {
  prefix: string | null;
  command: string;
  params: string[];
};

export type IrcConnectionState = {
  profile: RuntimeNetworkProfile;
  handlers: Handlers;
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
  pendingReplyContexts: PendingReplyContext[];
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
  handleChannelListNumeric(command: string, params: string[]): boolean;
  recordChannelListEntry(requestId: string, entry: ChannelListEntry): void;
  requestChannelList(requestId: string): boolean;
  resetTransientState(): void;
  sendRaw(raw: string, statusTarget?: string): boolean;
  sendClientRaw(raw: string, sourceTarget?: string): boolean;
  setFriendNicks(nicks: string[]): void;
  clearExpiredChannelSessions(): void;
  getChannelSession(channel: string): ChannelSessionState | null;
  listPendingChannels(): Array<{ networkId: string; channel: string }>;
  removeChannelSession(channel: string): ChannelSessionState | null;
  setChannelSession(
    channel: string,
    phase: ChannelSessionPhase,
    options?: { sourceTarget?: string; visiblePending?: boolean; previouslyJoined?: boolean }
  ): ChannelSessionState;
  updateChannelUsers(channel: string, nick: string | null, joined: boolean): ChannelUserState[];
};
