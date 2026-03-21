import { getChannelSession, removeChannelSession, setChannelSession } from './irc-channel-state.js';
import type { ChannelListEntry, ChannelUserState, NetworkRuntimeState } from '../shared/protocol.js';
import type { PendingReplyContext } from './irc-reply-context-types.js';
import type { ChannelSessionPhase, IrcLifecycleState, IrcSocket } from './irc-types.js';
import type { RuntimeNetworkProfile } from './storage-types.js';

export type IrcLifecyclePort = {
  readonly state: Pick<NetworkRuntimeState, 'phase' | 'serverName' | 'nick'>;
  openSocket(socket: IrcSocket): void;
  beginLogin(): void;
  setConnectDeadlineTimer(timer: ReturnType<typeof setTimeout>): void;
  markConnectionFailure(detail: string): void;
  handleSocketClosed(socket: IrcSocket): void;
  markRegistered(serverName: string | null, nick: string | null): void;
  connect(resetRetryBudget?: boolean): void;
  disconnect(raw?: string): void;
  updateProfile(profile: RuntimeNetworkProfile): void;
  clearReconnectTimer(): void;
  clearConnectDeadlineTimer(): void;
  resetTransientState(): void;
};

export type IrcCommandPort = {
  join(channel: string, sourceTarget?: string, options?: { visiblePending?: boolean } | string): boolean;
  part(channel: string, reason?: string, sourceTarget?: string): boolean;
  say(target: string, text: string, sourceTarget?: string): void;
  action(target: string, text: string, sourceTarget?: string): void;
  setNick(nick: string, sourceTarget?: string): boolean;
  clearPendingNick(): void;
  applyNickFallback(fallbackNick: string, options: { replyTarget?: string; updatePending: boolean }): void;
  confirmNick(newNick: string): void;
};

export type IrcFriendPresencePort = {
  setFriendNicks(nicks: string[]): void;
  refreshFriendPresence(): void;
  handleFriendPresence(pollId: number, onlineNicks: string[]): void;
  disableFriendPresence(): void;
  clearFriendPresenceTimer(): void;
  updateOnlineFriendKeys(onlineNicks: string[]): void;
};

export type IrcReplyPort = {
  queueReplyContext(context: PendingReplyContext): void;
  consumeReplyTarget(command: string, params: string[], nick: string | null, rawTarget?: string): string | null;
  consumeReplyContext(command: string, params: string[], nick: string | null, rawTarget?: string): PendingReplyContext | null;
  discardPendingChannelReplyContexts(
    channel: string,
    predicate?: (context: Extract<PendingReplyContext, { kind: 'channel' }>) => boolean
  ): Array<Extract<PendingReplyContext, { kind: 'channel' }>>;
  consumePendingNickReplyContexts(requestedNick: string): Array<Extract<PendingReplyContext, { kind: 'nick' }>>;
  discardPendingNickReplyContexts(): Array<Extract<PendingReplyContext, { kind: 'nick' }>>;
  prunePendingReplyContexts(): void;
};

export type IrcTransportPort = {
  sendRaw(raw: string, statusTarget?: string): boolean;
  sendClientRaw(raw: string, sourceTarget?: string): boolean;
  consume(chunk: string): void;
};

export type IrcChannelListPort = {
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
  startChannelList(mode: 'raw' | 'structured', options: { requestId?: string; sourceTarget?: string }): void;
};

export type IrcChannelPort = {
  updateChannelUsers(channel: string, nick: string | null, joined: boolean): ChannelUserState[];
  getTrackedChannelUsers(channel: string): ChannelUserState[];
  setTrackedChannelUsers(channel: string, users: ChannelUserState[]): ChannelUserState[];
  getTrackedChannelUserEntries(): Array<[string, ChannelUserState[]]>;
  resolveTrackedChannel(channel: string): string | null;
  clearExpiredChannelSessions(): void;
  getChannelSession(channel: string): ReturnType<typeof getChannelSession>;
  listPendingChannels(): Array<{ networkId: string; channel: string }>;
  trackChannel(channel: string): string;
  untrackChannel(channel: string): void;
  removeChannelSession(channel: string): ReturnType<typeof removeChannelSession>;
  handleSelfChannelDeparture(channel: string): void;
  setChannelSession(
    channel: string,
    phase: ChannelSessionPhase,
    options?: { sourceTarget?: string; visiblePending?: boolean; previouslyJoined?: boolean }
  ): ReturnType<typeof setChannelSession>;
  clearChannelSessions(): void;
};

export type RuntimeIrcSession = {
  readonly lifecycle: Pick<IrcLifecyclePort, 'state' | 'connect' | 'disconnect' | 'updateProfile'>;
  readonly command: Pick<IrcCommandPort, 'join' | 'part' | 'say' | 'action' | 'setNick'>;
  readonly friendPresence: Pick<IrcFriendPresencePort, 'setFriendNicks'>;
  readonly transport: Pick<IrcTransportPort, 'sendClientRaw' | 'sendRaw'>;
  readonly channelList: Pick<
    IrcChannelListPort,
    'getActiveChannelListSnapshot' | 'requestChannelList' | 'getChannelListRequestFailureMessage'
  >;
  readonly channels: Pick<IrcChannelPort, 'listPendingChannels'>;
  get socket(): IrcLifecycleState['socket'];
};
