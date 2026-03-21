import type { PendingReplyContext } from './irc-reply-context-types.js';
import type {
  ChannelSessionState,
  IrcChannelListState,
  IrcChannelTrackingState,
  IrcFriendPresenceState,
  IrcSocket,
} from './irc-state-types.js';
import type { ChannelListEntry, ChannelUserState, NetworkRuntimeState } from '../shared/protocol.js';
import type { RuntimeNetworkProfile } from './storage-types.js';

export type LegacyIrcConnectionCompat = {
  readonly state: Pick<NetworkRuntimeState, 'phase' | 'serverName' | 'nick'>;
  socket: IrcSocket | null;
  buffer: string;
  channelUsers: Map<string, ChannelUserState[]>;
  channelSessions: IrcChannelTrackingState['sessions'];
  connectDeadlineTimer: ReturnType<typeof setTimeout> | null;
  friendNicks: string[];
  onlineFriendKeys: Set<string>;
  friendPresenceTimer: ReturnType<typeof setInterval> | null;
  pendingFriendPresencePoll: IrcFriendPresenceState['pendingPoll'];
  nextFriendPresencePollId: number;
  friendPresenceEnabled: boolean;
  manualDisconnect: boolean;
  reconnectAttempts: number;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  connected: boolean;
  serverName: string | null;
  currentNick: string;
  activeChannelListMode: IrcChannelListState['active']['mode'];
  activeChannelListSourceTarget: string | null;
  activeChannelListRequestId: string | null;
  activeChannelListEntries: ChannelListEntry[];
  drainingChannelListMode: IrcChannelListState['draining']['mode'];
  drainingChannelListSourceTarget: string | null;
  drainingChannelListRequestId: string | null;
  lastFailureMessage: string | null;
  channelJoinTimeoutMs: number;
  channelListTimeoutTimer: ReturnType<typeof setTimeout> | null;
  drainingChannelListExpiresAt: number | null;
  channelListTimeoutMs: number;
  channelListDrainGraceMs: number;
  pendingNick: string | null;
  pendingReplyContexts: readonly PendingReplyContext[];
  beginLogin(): void;
  clearConnectDeadlineTimer(): void;
  clearReconnectTimer(): void;
  disableFriendPresence(): void;
  connect(resetRetryBudget?: boolean): void;
  disconnect(raw?: string): void;
  consume(chunk: string): void;
  consumeReplyContext(command: string, params: string[], nick: string | null, rawTarget?: string): PendingReplyContext | null;
  handleFriendPresence(pollId: number, onlineNicks: string[]): void;
  join(channel: string, sourceTarget?: string, options?: { visiblePending?: boolean } | string): boolean;
  part(channel: string, reason?: string, sourceTarget?: string): boolean;
  say(target: string, text: string, sourceTarget?: string): void;
  action(target: string, text: string, sourceTarget?: string): void;
  setNick(nick: string, sourceTarget?: string): boolean;
  consumeReplyTarget(command: string, params: string[], nick: string | null, rawTarget?: string): string | null;
  queueReplyContext(context: PendingReplyContext): void;
  prunePendingReplyContexts(): void;
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
  clearFriendPresenceTimer(): void;
  updateOnlineFriendKeys(onlineNicks: string[]): void;
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
    phase: 'joining' | 'joined' | 'leaving',
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
  clearActiveChannelList(): void;
  abortActiveChannelList(message: string): void;
  isChannelListPending(): boolean;
  startChannelList(mode: 'raw' | 'structured', options: { requestId?: string; sourceTarget?: string }): void;
  trackChannel(channel: string): string;
  untrackChannel(channel: string): void;
  clearChannelSessions(): void;
  updateChannelUsers(channel: string, nick: string | null, joined: boolean): ChannelUserState[];
  updateProfile(profile: RuntimeNetworkProfile): void;
};
