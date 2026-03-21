import { emitMessage, emitState, emitStatus } from './irc-emit.js';
import {
  abortActiveChannelList,
  clearActiveChannelList,
  clearDrainingChannelList,
  finishChannelListRequest,
  getActiveChannelListSnapshot,
  getChannelListRequestFailureMessage,
  handleChannelListNumeric,
  isChannelListPending,
  recordChannelListEntry,
  requestChannelList,
  startChannelList,
} from './irc-channel-list.js';
import {
  clearChannelSessions,
  clearExpiredChannelSessions,
  getChannelSession,
  getTrackedChannelUserEntries,
  getTrackedChannelUsers,
  handleSelfChannelDeparture,
  listPendingChannels,
  removeChannelSession,
  resolveTrackedChannel,
  setChannelSession,
  setTrackedChannelUsers,
  trackChannel,
  untrackChannel,
  updateChannelUsers,
} from './irc-channel-state.js';
import {
  beginLogin,
  clearConnectDeadlineTimer,
  clearReconnectTimer,
  connect,
  disconnect,
  handleSocketClosed,
  markConnectionFailure,
  markRegistered,
  openSocket,
  resetTransientState,
  setConnectDeadlineTimer,
  updateProfile,
} from './irc-connection-lifecycle.js';
import { consume, createSelfMessage, sendClientRaw, sendRaw, sendTrackedRaw } from './irc-connection-io.js';
import {
  clearFriendPresenceTimer,
  disableFriendPresence,
  handleFriendPresence,
  refreshFriendPresence,
  setFriendNicks,
  updateOnlineFriendKeys,
} from './irc-friend-presence.js';
import type {
  IrcChannelListContext,
  IrcChannelStateContext,
  IrcClientIoContext,
  IrcConnectContext,
  IrcFriendPresenceContext,
  IrcRawIoContext,
  IrcReplyStateContext,
} from './irc-contexts.js';
import { createChannelReplyContext, createMessageReplyContext, createNickReplyContext } from './irc-reply-context.js';
import {
  consumePendingNickReplyContexts,
  consumeReplyContext,
  consumeReplyTarget,
  discardPendingNickReplyContexts,
  prunePendingReplyContexts,
  queueReplyContext,
} from './irc-reply-state.js';
import type { ChannelListEntry, ChannelUserState, NetworkRuntimeState } from '../shared/protocol.js';
import type { PendingReplyContext } from './irc-reply-context-types.js';
import type { ChannelSessionPhase, IrcConnectionState, IrcLifecycleState, IrcSocket } from './irc-types.js';
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
  readonly transport: Pick<IrcTransportPort, 'sendClientRaw' | 'sendRaw'>;
  readonly channelList: Pick<
    IrcChannelListPort,
    'getActiveChannelListSnapshot' | 'requestChannelList' | 'getChannelListRequestFailureMessage'
  >;
  readonly channels: Pick<IrcChannelPort, 'listPendingChannels'>;
  get socket(): IrcLifecycleState['socket'];
};

type IrcLifecyclePortContext = IrcConnectContext & Pick<
  IrcConnectionState,
  'beginLogin' | 'consume' | 'handleSocketClosed' | 'markConnectionFailure' | 'openSocket' | 'setConnectDeadlineTimer'
>;

type IrcCommandContext = IrcClientIoContext & Pick<
  IrcConnectionState,
  'consumePendingNickReplyContexts' | 'getChannelSession' | 'pendingNick' | 'replyTracker' | 'sendRaw' | 'setChannelSession'
>;

export const createIrcLifecyclePort = (
  connection: IrcLifecyclePortContext
): IrcLifecyclePort => ({
  get state() {
    const { lifecycle } = connection;
    const phase: NetworkRuntimeState['phase'] = lifecycle.connected
      ? 'connected'
      : lifecycle.socket
        ? 'connecting'
        : 'offline';
    return {
      phase,
      serverName: lifecycle.serverName,
      nick: lifecycle.currentNick,
    };
  },
  openSocket(socket) { openSocket(connection, socket); },
  beginLogin() { beginLogin(connection); },
  setConnectDeadlineTimer(timer) { setConnectDeadlineTimer(connection, timer); },
  markConnectionFailure(detail) { markConnectionFailure(connection, detail); },
  handleSocketClosed(socket) { handleSocketClosed(connection, socket); },
  markRegistered(serverName, nick) { markRegistered(connection, serverName, nick); },
  connect(resetRetryBudget = true) { connect(connection, resetRetryBudget); },
  disconnect(raw = 'QUIT :Client disconnecting') { disconnect(connection, raw); },
  updateProfile(profile) { updateProfile(connection, profile); },
  clearReconnectTimer() { clearReconnectTimer(connection); },
  clearConnectDeadlineTimer() { clearConnectDeadlineTimer(connection); },
  resetTransientState() { resetTransientState(connection); },
});

export const createIrcCommandPort = (connection: IrcCommandContext): IrcCommandPort => ({
  join(channel, sourceTarget = 'server', options = {}) {
    if (!connection.lifecycle.connected) {
      emitStatus(connection, connection.lifecycle.socket ? 'Still connecting to server' : 'Not connected', 'error', sourceTarget);
      return false;
    }
    if (!connection.sendRaw(`JOIN ${channel}`, sourceTarget)) {
      return false;
    }
    const visiblePending = typeof options === 'string' ? false : options.visiblePending ?? false;
    connection.setChannelSession(channel, 'joining', { sourceTarget, visiblePending });
    return true;
  },
  part(channel, reason = 'Leaving', sourceTarget = channel) {
    if (connection.getChannelSession(channel)?.phase === 'joined') {
      connection.setChannelSession(channel, 'leaving', { sourceTarget, visiblePending: false });
    }
    return sendTrackedRaw(
      connection,
      `PART ${channel} :${reason}`,
      sourceTarget,
      createChannelReplyContext(sourceTarget, channel, 'part')
    );
  },
  say(target, text, sourceTarget = target) {
    if (sendTrackedRaw(connection, `PRIVMSG ${target} :${text}`, sourceTarget, createMessageReplyContext(sourceTarget, target))) {
      emitMessage(connection, createSelfMessage(connection, target, text));
    }
  },
  action(target, text, sourceTarget = target) {
    if (
      sendTrackedRaw(
        connection,
        `PRIVMSG ${target} :\u0001ACTION ${text}\u0001`,
        sourceTarget,
        createMessageReplyContext(sourceTarget, target)
      )
    ) {
      emitMessage(connection, createSelfMessage(connection, target, `* ${connection.lifecycle.currentNick} ${text}`));
    }
  },
  setNick(nick, sourceTarget = 'server') {
    if (!connection.lifecycle.connected) {
      emitStatus(connection, connection.lifecycle.socket ? 'Still connecting to server' : 'Not connected', 'error', sourceTarget);
      return false;
    }
    return sendTrackedRaw(connection, `NICK ${nick}`, sourceTarget, createNickReplyContext(sourceTarget, nick));
  },
  clearPendingNick() { connection.replyTracker.clearPendingNick(); },
  applyNickFallback(fallbackNick, options) {
    if (options.updatePending) {
      connection.pendingNick = fallbackNick;
    } else {
      connection.lifecycle.currentNick = fallbackNick;
    }
    if (options.replyTarget) {
      connection.queueReplyContext(createNickReplyContext(options.replyTarget, fallbackNick));
    }
  },
  confirmNick(newNick) {
    connection.consumePendingNickReplyContexts(newNick);
    connection.lifecycle.currentNick = newNick;
    emitState(connection);
  },
});

export const createIrcFriendPresencePort = (connection: IrcFriendPresenceContext): IrcFriendPresencePort => ({
  setFriendNicks(nicks) { setFriendNicks(connection, nicks); },
  refreshFriendPresence() { refreshFriendPresence(connection); },
  handleFriendPresence(pollId, onlineNicks) { handleFriendPresence(connection, pollId, onlineNicks); },
  disableFriendPresence() { disableFriendPresence(connection); },
  clearFriendPresenceTimer() { clearFriendPresenceTimer(connection); },
  updateOnlineFriendKeys(onlineNicks) { updateOnlineFriendKeys(connection, onlineNicks); },
});

export const createIrcReplyPort = (connection: IrcReplyStateContext): IrcReplyPort => ({
  queueReplyContext(context) { queueReplyContext(connection, context); },
  consumeReplyTarget(command, params, nick, rawTarget) {
    return consumeReplyTarget(connection, command, params, nick, rawTarget);
  },
  consumeReplyContext(command, params, nick, rawTarget) {
    return consumeReplyContext(connection, command, params, nick, rawTarget);
  },
  discardPendingChannelReplyContexts(channel, predicate) {
    return connection.replyTracker.discardPendingChannelReplyContexts(channel, predicate);
  },
  consumePendingNickReplyContexts(requestedNick) { return consumePendingNickReplyContexts(connection, requestedNick); },
  discardPendingNickReplyContexts() { return discardPendingNickReplyContexts(connection); },
  prunePendingReplyContexts() { prunePendingReplyContexts(connection); },
});

export const createIrcTransportPort = (connection: IrcConnectionState): IrcTransportPort => ({
  sendRaw(raw, statusTarget) { return sendRaw(connection, raw, statusTarget); },
  sendClientRaw(raw, sourceTarget = 'server') { return sendClientRaw(connection, raw, sourceTarget); },
  consume(chunk) { consume(connection, chunk); },
});

export const createIrcChannelListPort = (connection: IrcChannelListContext): IrcChannelListPort => ({
  requestChannelList(requestId) { return requestChannelList(connection, requestId); },
  recordChannelListEntry(requestId, entry) { recordChannelListEntry(connection, requestId, entry); },
  finishChannelListRequest(requestId) { finishChannelListRequest(connection, requestId); },
  getChannelListRequestFailureMessage() { return getChannelListRequestFailureMessage(connection); },
  getActiveChannelListSnapshot() { return getActiveChannelListSnapshot(connection); },
  handleChannelListNumeric(command, params) { return handleChannelListNumeric(connection, command, params); },
  clearActiveChannelList() { clearActiveChannelList(connection); },
  abortActiveChannelList(message) { abortActiveChannelList(connection, message); },
  clearDrainingChannelList() { clearDrainingChannelList(connection); },
  isChannelListPending() { return isChannelListPending(connection); },
  startChannelList(mode, options) { startChannelList(connection, mode, options); },
});

export const createIrcChannelPort = (connection: IrcChannelStateContext): IrcChannelPort => ({
  updateChannelUsers(channel, nick, joined) { return updateChannelUsers(connection, channel, nick, joined); },
  getTrackedChannelUsers(channel) { return getTrackedChannelUsers(connection, channel); },
  setTrackedChannelUsers(channel, users) { return setTrackedChannelUsers(connection, channel, users); },
  getTrackedChannelUserEntries() { return getTrackedChannelUserEntries(connection); },
  resolveTrackedChannel(channel) { return resolveTrackedChannel(connection, channel); },
  clearExpiredChannelSessions() { clearExpiredChannelSessions(connection); },
  getChannelSession(channel) { return getChannelSession(connection, channel); },
  listPendingChannels() { return listPendingChannels(connection); },
  trackChannel(channel) { return trackChannel(connection, channel); },
  untrackChannel(channel) { untrackChannel(connection, channel); },
  removeChannelSession(channel) { return removeChannelSession(connection, channel); },
  handleSelfChannelDeparture(channel) { handleSelfChannelDeparture(connection, channel); },
  setChannelSession(channel, phase, options = {}) { return setChannelSession(connection, channel, phase, options); },
  clearChannelSessions() { clearChannelSessions(connection); },
});

export const createRuntimeIrcSession = (connection: {
  lifecycle: IrcLifecycleState;
  lifecyclePort: IrcLifecyclePort;
  commandPort: IrcCommandPort;
  transportPort: IrcTransportPort;
  channelListPort: IrcChannelListPort;
  channelPort: IrcChannelPort;
}): RuntimeIrcSession => ({
  lifecycle: connection.lifecyclePort,
  command: connection.commandPort,
  transport: connection.transportPort,
  channelList: connection.channelListPort,
  channels: connection.channelPort,
  get socket() {
    return connection.lifecycle.socket;
  },
});
