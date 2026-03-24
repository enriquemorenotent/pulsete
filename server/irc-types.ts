import type { ChannelUserState, NetworkRuntimeState } from '../shared/protocol.js';
import type {
  ChannelSessionPhase,
  ChannelSessionState,
  IrcChannelListMode,
  IrcChannelListState,
  IrcChannelTrackingState,
  IrcFriendPresenceState,
  IrcLifecycleState,
  IrcReplyTracker,
  IrcSocket,
} from './irc-state-types.js';
import type { PendingReplyContext } from './irc-reply-context-types.js';
import type { ChannelListEntry } from '../shared/protocol.js';
import type { MessageInput, RuntimeNetworkProfile } from './storage-types.js';

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
  | {
      type: 'send-failed';
      networkId: string;
      sourceTarget: string;
      target: string;
      message: string;
      rollbackMessageId?: string;
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

export type IrcConnectionData = {
  profile: RuntimeNetworkProfile;
  handlers: Handlers;
  lifecycle: IrcLifecycleState;
  channels: IrcChannelTrackingState;
  friendPresence: IrcFriendPresenceState;
  channelList: IrcChannelListState;
  replyTracker: IrcReplyTracker;
};

export type IrcConnectionMethods = {
  readonly state: Pick<NetworkRuntimeState, 'phase' | 'serverName' | 'nick'>;
  beginLogin(): void;
  connect(resetRetryBudget?: boolean): void;
  disconnect(raw?: string): void;
  dispose(): void;
  updateProfile(profile: RuntimeNetworkProfile): void;
  clearReconnectTimer(): void;
  clearConnectDeadlineTimer(): void;
  resetTransientState(): void;
  markConnectionFailure(detail: string): void;
  markRegistered(serverName: string | null, nick: string | null): void;
  openSocket(socket: IrcSocket): void;
  handleSocketClosed(socket: IrcSocket): void;
  setConnectDeadlineTimer(timer: ReturnType<typeof setTimeout>): void;
  consume(chunk: string): void;
  sendRaw(raw: string, statusTarget?: string): boolean;
  sendClientRaw(raw: string, sourceTarget?: string): boolean;
  join(channel: string, sourceTarget?: string, options?: { visiblePending?: boolean } | string): boolean;
  part(channel: string, reason?: string, sourceTarget?: string): boolean;
  say(target: string, text: string, sourceTarget?: string): void;
  action(target: string, text: string, sourceTarget?: string): void;
  setNick(nick: string, sourceTarget?: string): boolean;
  clearPendingNick(): void;
  confirmNick(newNick: string): void;
  applyNickFallback(fallbackNick: string, options: { replyTarget?: string; updatePending: boolean }): void;
  setFriendNicks(nicks: string[]): void;
  refreshFriendPresence(): void;
  handleFriendPresence(pollId: number, onlineNicks: string[]): void;
  disableFriendPresence(): void;
  clearFriendPresenceTimer(): void;
  updateOnlineFriendKeys(onlineNicks: string[]): void;
  requestChannelList(requestId: string): boolean;
  recordChannelListEntry(requestId: string, entry: ChannelListEntry): void;
  finishChannelListRequest(requestId: string): void;
  getChannelListRequestFailureMessage(): string;
  getActiveChannelListSnapshot(): { requestId: string; entries: ChannelListEntry[] } | null;
  handleChannelListNumeric(command: string, params: string[]): boolean;
  clearActiveChannelList(): void;
  abortActiveChannelList(message: string): void;
  clearDrainingChannelList(): void;
  isChannelListPending(): boolean;
  startChannelList(mode: IrcChannelListMode, options: { requestId?: string; sourceTarget?: string }): void;
  listPendingChannels(): Array<{ networkId: string; channel: string }>;
  listReconnectChannels(): string[];
  trackChannel(channel: string): string;
  untrackChannel(channel: string): void;
  setReconnectChannels(channels: string[]): void;
  rememberReconnectChannel(channel: string): string;
  forgetReconnectChannel(channel: string): string | null;
  getChannelSession(channel: string): ChannelSessionState | null;
  updateChannelUsers(channel: string, nick: string | null, joined: boolean): ChannelUserState[];
  getTrackedChannelUsers(channel: string): ChannelUserState[];
  setTrackedChannelUsers(channel: string, users: ChannelUserState[]): ChannelUserState[];
  getTrackedChannelUserEntries(): Array<[string, ChannelUserState[]]>;
  resolveTrackedChannel(channel: string): string | null;
  clearExpiredChannelSessions(): void;
  removeChannelSession(channel: string): ChannelSessionState | null;
  handleSelfChannelDeparture(channel: string): void;
  setChannelSession(
    channel: string,
    phase: ChannelSessionPhase,
    options?: { sourceTarget?: string; visiblePending?: boolean; previouslyJoined?: boolean }
  ): ChannelSessionState;
  clearChannelSessions(): void;
  queueReplyContext(context: PendingReplyContext): void;
  consumeReplyTarget(command: string, params: string[], nick: string | null, rawTarget?: string): string | null;
  consumeReplyContext(command: string, params: string[], nick: string | null, rawTarget?: string): PendingReplyContext | null;
  prunePendingReplyContexts(): void;
  discardPendingChannelReplyContexts(
    channel: string,
    predicate?: (context: Extract<PendingReplyContext, { kind: 'channel' }>) => boolean
  ): Array<Extract<PendingReplyContext, { kind: 'channel' }>>;
  consumePendingNickReplyContexts(requestedNick: string): Array<Extract<PendingReplyContext, { kind: 'nick' }>>;
  discardPendingNickReplyContexts(): Array<Extract<PendingReplyContext, { kind: 'nick' }>>;
};

export type IrcConnectionState = IrcConnectionData & IrcConnectionMethods;

export type IrcRuntimeCommandConnection = Pick<
  IrcConnectionState,
  'action' | 'disconnect' | 'join' | 'lifecycle' | 'part' | 'say' | 'sendClientRaw' | 'sendRaw' | 'setNick'
>;

export type IrcRuntimeChannelListConnection = Pick<
  IrcConnectionState,
  'getActiveChannelListSnapshot' | 'getChannelListRequestFailureMessage' | 'requestChannelList'
>;

export type {
  FriendPresencePollState,
  IrcChannelListActiveState,
  IrcChannelListDrainingState,
  IrcChannelListState,
  IrcChannelTrackingState,
  IrcFriendPresenceState,
  IrcLifecycleState,
  IrcReplyTracker,
  IrcSocket,
} from './irc-state-types.js';
