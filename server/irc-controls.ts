import type { ChannelListEntry, ChannelUserState } from '../shared/protocol-chat.js';
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
  forgetReconnectChannel,
  getChannelSession,
  listReconnectChannels,
  getTrackedChannelUserEntries,
  getTrackedChannelUsers,
  handleSelfChannelDeparture,
  rememberReconnectChannel,
  listPendingChannels,
  removeChannelSession,
  resolveTrackedChannel,
  setReconnectChannels,
  setChannelSession,
  setTrackedChannelUsers,
  trackChannel,
  untrackChannel,
  updateChannelUsers,
} from './irc-channel-state.js';
import {
  applyNickFallback,
  beginLogin,
  clearConnectDeadlineTimer,
  clearPendingNick,
  clearReconnectTimer,
  confirmNick,
  connect,
  disconnect,
  dispose,
  handleSocketClosed,
  markConnectionFailure,
  markRegistered,
  openSocket,
  resetTransientState,
  setConnectDeadlineTimer,
  updateProfile,
} from './irc-connection-lifecycle.js';
import { consume, sendClientRaw, sendRaw, sendTrackedRaw } from './irc-connection-io.js';
import { emitStatus } from './irc-emit.js';
import {
  clearFriendPresenceTimer,
  disableFriendPresence,
  handleFriendPresenceIsonReply,
  handleFriendPresenceMonitorUpdate,
  refreshFriendPresence,
  setFriendPresenceMonitorSupport,
  setFriendNicks,
  updateFriendPresenceStatuses,
} from './irc-friend-presence.js';
import { createIrcCommandControls } from './irc-controls-commands.js';
import { createNickReplyContext } from './irc-reply-context.js';
import type { PendingReplyContext } from './irc-reply-context-types.js';
import {
  consumePendingNickReplyContexts,
  consumeReplyContext,
  consumeReplyTarget,
  discardPendingNickReplyContexts,
  prunePendingReplyContexts,
  queueReplyContext,
} from './irc-reply-state.js';
import type { IrcConnectionState } from './irc-types.js';
import type {
  ChannelSessionPhase,
  ChannelSessionState,
  IrcChannelListMode,
  IrcSocket,
} from './irc-state-types.js';
import type { RuntimeNetworkProfile } from './storage-types.js';
import type { PresenceStatus } from '../shared/protocol-chat.js';

export const createIrcControllers = (connection: IrcConnectionState) => ({
  lifecycleControl: {
    beginLogin: () => beginLogin(connection),
    connect: (resetRetryBudget = true) => connect(connection, resetRetryBudget),
    disconnect: (raw?: string) => disconnect(connection, raw),
    dispose: () => dispose(connection),
    updateProfile: (profile: RuntimeNetworkProfile) => updateProfile(connection, profile),
    clearReconnectTimer: () => clearReconnectTimer(connection),
    clearConnectDeadlineTimer: () => clearConnectDeadlineTimer(connection),
    resetTransientState: () => resetTransientState(connection),
    markConnectionFailure: (detail: string) => markConnectionFailure(connection, detail),
    markRegistered: (serverName: string | null, nick: string | null) => markRegistered(connection, serverName, nick),
    openSocket: (socket: IrcSocket) => openSocket(connection, socket),
    handleSocketClosed: (socket: IrcSocket) => handleSocketClosed(connection, socket),
    setConnectDeadlineTimer: (timer: ReturnType<typeof setTimeout>) => setConnectDeadlineTimer(connection, timer),
    setNick: (nick: string, sourceTarget = 'server') => {
      if (!connection.lifecycle.connected) {
        emitStatus(connection, connection.lifecycle.socket ? 'Still connecting to server' : 'Not connected', 'error', sourceTarget);
        return false;
      }
      return sendTrackedRaw(connection, `NICK ${nick}`, sourceTarget, createNickReplyContext(sourceTarget, nick));
    },
    clearPendingNick: () => clearPendingNick(connection),
    confirmNick: (newNick: string) => confirmNick(connection, newNick),
    applyNickFallback: (fallbackNick: string, options: { replyTarget?: string; updatePending: boolean }) =>
      applyNickFallback(connection, fallbackNick, options),
  },
  io: {
    consume: (chunk: string) => consume(connection, chunk),
    sendRaw: (raw: string, statusTarget?: string) => sendRaw(connection, raw, statusTarget),
    sendClientRaw: (raw: string, sourceTarget?: string) => sendClientRaw(connection, raw, sourceTarget),
  },
  commands: createIrcCommandControls(connection),
  friendsControl: {
    setFriendNicks: (nicks: string[]) => setFriendNicks(connection, nicks),
    refreshFriendPresence: () => refreshFriendPresence(connection),
    setFriendPresenceMonitorSupport: (supported: boolean, limit: number | null) =>
      setFriendPresenceMonitorSupport(connection, supported, limit),
    handleFriendPresenceIsonReply: (
      snapshotId: number,
      onlineNicks: string[] | null,
      unsupported: boolean
    ) => handleFriendPresenceIsonReply(connection, snapshotId, onlineNicks, unsupported),
    handleFriendPresenceMonitorUpdate: (nicks: string[], presence: PresenceStatus) =>
      handleFriendPresenceMonitorUpdate(connection, nicks, presence),
    disableFriendPresence: () => disableFriendPresence(connection),
    clearFriendPresenceTimer: () => clearFriendPresenceTimer(connection),
    updateFriendPresenceStatuses: (presenceByKey: Map<string, PresenceStatus>) =>
      updateFriendPresenceStatuses(connection, presenceByKey),
  },
  channelLists: {
    requestChannelList: (requestId: string) => requestChannelList(connection, requestId),
    recordChannelListEntry: (requestId: string, entry: ChannelListEntry) => recordChannelListEntry(connection, requestId, entry),
    finishChannelListRequest: (requestId: string) => finishChannelListRequest(connection, requestId),
    getChannelListRequestFailureMessage: () => getChannelListRequestFailureMessage(connection),
    getActiveChannelListSnapshot: () => getActiveChannelListSnapshot(connection),
    handleChannelListNumeric: (command: string, params: string[]) => handleChannelListNumeric(connection, command, params),
    clearActiveChannelList: () => clearActiveChannelList(connection),
    abortActiveChannelList: (message: string) => abortActiveChannelList(connection, message),
    clearDrainingChannelList: () => clearDrainingChannelList(connection),
    isChannelListPending: () => isChannelListPending(connection),
    startChannelList: (mode: IrcChannelListMode, options: { requestId?: string; sourceTarget?: string }) =>
      startChannelList(connection, mode, options),
  },
  channelsControl: {
    listPendingChannels: () => listPendingChannels(connection),
    listReconnectChannels: () => listReconnectChannels(connection),
    trackChannel: (channel: string) => trackChannel(connection, channel),
    untrackChannel: (channel: string) => untrackChannel(connection, channel),
    setReconnectChannels: (channels: string[]) => setReconnectChannels(connection, channels),
    rememberReconnectChannel: (channel: string) => rememberReconnectChannel(connection, channel),
    forgetReconnectChannel: (channel: string) => forgetReconnectChannel(connection, channel) ?? null,
    getChannelSession: (channel: string) => getChannelSession(connection, channel),
    updateChannelUsers: (
      channel: string,
      nick: string | null,
      joined: boolean,
      details?: Partial<ChannelUserState>
    ) => updateChannelUsers(connection, channel, nick, joined, details),
    getTrackedChannelUsers: (channel: string) => getTrackedChannelUsers(connection, channel),
    setTrackedChannelUsers: (channel: string, users: ChannelUserState[]) => setTrackedChannelUsers(connection, channel, users),
    getTrackedChannelUserEntries: () => getTrackedChannelUserEntries(connection),
    resolveTrackedChannel: (channel: string) => resolveTrackedChannel(connection, channel),
    clearExpiredChannelSessions: () => clearExpiredChannelSessions(connection),
    removeChannelSession: (channel: string) => removeChannelSession(connection, channel),
    handleSelfChannelDeparture: (channel: string) => handleSelfChannelDeparture(connection, channel),
    setChannelSession: (
      channel: string,
      phase: ChannelSessionPhase,
      options?: { sourceTarget?: string; visiblePending?: boolean; previouslyJoined?: boolean }
    ): ChannelSessionState => setChannelSession(connection, channel, phase, options),
    clearChannelSessions: () => clearChannelSessions(connection),
  },
  replies: {
    queueReplyContext: (context: PendingReplyContext) => queueReplyContext(connection, context),
    consumeReplyTarget: (
      command: string,
      params: string[],
      nick: string | null,
      rawTarget?: string,
      label?: string | null
    ) => consumeReplyTarget(connection, command, params, nick, rawTarget, label),
    consumeReplyContext: (
      command: string,
      params: string[],
      nick: string | null,
      rawTarget?: string,
      label?: string | null
    ) => consumeReplyContext(connection, command, params, nick, rawTarget, label),
    prunePendingReplyContexts: () => prunePendingReplyContexts(connection),
    discardPendingChannelReplyContexts: (
      channel: string,
      predicate?: (context: Extract<PendingReplyContext, { kind: 'channel' }>) => boolean
    ) => connection.replyTracker.discardPendingChannelReplyContexts(channel, predicate),
    consumePendingNickReplyContexts: (requestedNick: string) => consumePendingNickReplyContexts(connection, requestedNick),
    discardPendingNickReplyContexts: () => discardPendingNickReplyContexts(connection),
  },
});
