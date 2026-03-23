import type { ChannelListEntry, ChannelUserState } from '../shared/protocol.js';
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
import { consume, createSelfMessage, sendClientRaw, sendRaw, sendTrackedRaw } from './irc-connection-io.js';
import { emitMessage, emitStatus } from './irc-emit.js';
import {
  clearFriendPresenceTimer,
  disableFriendPresence,
  handleFriendPresence,
  refreshFriendPresence,
  setFriendNicks,
  updateOnlineFriendKeys,
} from './irc-friend-presence.js';
import { createChannelReplyContext, createMessageReplyContext, createNickReplyContext } from './irc-reply-context.js';
import type { PendingReplyContext } from './irc-reply-context-types.js';
import {
  consumePendingNickReplyContexts,
  consumeReplyContext,
  consumeReplyTarget,
  discardPendingNickReplyContexts,
  prunePendingReplyContexts,
  queueReplyContext,
} from './irc-reply-state.js';
import type {
  IrcChannelController,
  IrcChannelListController,
  IrcCommandController,
  IrcConnectionState,
  IrcFriendPresenceController,
  IrcIoController,
  IrcLifecycleController,
  IrcReplyController,
} from './irc-types.js';
import type { ChannelSessionPhase, ChannelSessionState, IrcSocket } from './irc-state-types.js';
import type { RuntimeNetworkProfile } from './storage-types.js';

type IrcControllers = {
  lifecycleControl: IrcLifecycleController;
  io: IrcIoController;
  commands: IrcCommandController;
  friendsControl: IrcFriendPresenceController;
  channelLists: IrcChannelListController;
  channelsControl: IrcChannelController;
  replies: IrcReplyController;
};

export const createIrcControllers = (connection: IrcConnectionState): IrcControllers => ({
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
  commands: {
    join: (channel: string, sourceTarget = 'server', options: { visiblePending?: boolean } | string = {}) => {
      if (!connection.lifecycle.connected) {
        emitStatus(connection, connection.lifecycle.socket ? 'Still connecting to server' : 'Not connected', 'error', sourceTarget);
        return false;
      }
      if (!connection.io.sendRaw(`JOIN ${channel}`, sourceTarget)) {
        return false;
      }
      const visiblePending = typeof options === 'string' ? false : options.visiblePending ?? false;
      connection.channelsControl.setChannelSession(channel, 'joining', { sourceTarget, visiblePending });
      return true;
    },
    part: (channel: string, reason = 'Leaving', sourceTarget = channel) => {
      if (connection.channelsControl.getChannelSession(channel)?.phase === 'joined') {
        connection.channelsControl.setChannelSession(channel, 'leaving', { sourceTarget, visiblePending: false });
      }
      return sendTrackedRaw(connection, `PART ${channel} :${reason}`, sourceTarget, createChannelReplyContext(sourceTarget, channel, 'part'));
    },
    say: (target: string, text: string, sourceTarget = target) => {
      if (sendTrackedRaw(connection, `PRIVMSG ${target} :${text}`, sourceTarget, createMessageReplyContext(sourceTarget, target))) {
        emitMessage(connection, createSelfMessage(connection, target, text));
      }
    },
    action: (target: string, text: string, sourceTarget = target) => {
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
  },
  friendsControl: {
    setFriendNicks: (nicks: string[]) => setFriendNicks(connection, nicks),
    refreshFriendPresence: () => refreshFriendPresence(connection),
    handleFriendPresence: (pollId: number, onlineNicks: string[]) => handleFriendPresence(connection, pollId, onlineNicks),
    disableFriendPresence: () => disableFriendPresence(connection),
    clearFriendPresenceTimer: () => clearFriendPresenceTimer(connection),
    updateOnlineFriendKeys: (onlineNicks: string[]) => updateOnlineFriendKeys(connection, onlineNicks),
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
    startChannelList: (mode, options) => startChannelList(connection, mode, options),
  },
  channelsControl: {
    listPendingChannels: () => listPendingChannels(connection),
    trackChannel: (channel: string) => trackChannel(connection, channel),
    untrackChannel: (channel: string) => untrackChannel(connection, channel),
    getChannelSession: (channel: string) => getChannelSession(connection, channel),
    updateChannelUsers: (channel: string, nick: string | null, joined: boolean) =>
      updateChannelUsers(connection, channel, nick, joined),
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
    consumeReplyTarget: (command: string, params: string[], nick: string | null, rawTarget?: string) =>
      consumeReplyTarget(connection, command, params, nick, rawTarget),
    consumeReplyContext: (command: string, params: string[], nick: string | null, rawTarget?: string) =>
      consumeReplyContext(connection, command, params, nick, rawTarget),
    prunePendingReplyContexts: () => prunePendingReplyContexts(connection),
    discardPendingChannelReplyContexts: (
      channel: string,
      predicate?: (context: Extract<PendingReplyContext, { kind: 'channel' }>) => boolean
    ) => connection.replyTracker.discardPendingChannelReplyContexts(channel, predicate),
    consumePendingNickReplyContexts: (requestedNick: string) => consumePendingNickReplyContexts(connection, requestedNick),
    discardPendingNickReplyContexts: () => discardPendingNickReplyContexts(connection),
  },
});
