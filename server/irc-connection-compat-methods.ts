import type { IrcConnectionState } from './irc-types.js';
import type { PendingReplyContext } from './irc-reply-context-types.js';
import type { ChannelListEntry, ChannelUserState } from '../shared/protocol.js';
import type { IrcSocket } from './irc-state-types.js';
import type { RuntimeNetworkProfile } from './storage-types.js';

export const createIrcConnectionMethodDescriptors = (
  connection: IrcConnectionState
) => ({
  beginLogin: { enumerable: true, value: () => connection.ports.lifecycle.beginLogin() },
  clearConnectDeadlineTimer: { enumerable: true, value: () => connection.ports.lifecycle.clearConnectDeadlineTimer() },
  clearReconnectTimer: { enumerable: true, value: () => connection.ports.lifecycle.clearReconnectTimer() },
  disableFriendPresence: { enumerable: true, value: () => connection.ports.friendPresence.disableFriendPresence() },
  connect: { enumerable: true, value: (resetRetryBudget = true) => connection.ports.lifecycle.connect(resetRetryBudget) },
  disconnect: { enumerable: true, value: (raw?: string) => connection.ports.lifecycle.disconnect(raw) },
  consume: { enumerable: true, value: (chunk: string) => connection.ports.transport.consume(chunk) },
  consumeReplyContext: {
    enumerable: true,
    value: (command: string, params: string[], nick: string | null, rawTarget?: string) =>
      connection.ports.reply.consumeReplyContext(command, params, nick, rawTarget),
  },
  handleFriendPresence: {
    enumerable: true,
    value: (pollId: number, onlineNicks: string[]) =>
      connection.ports.friendPresence.handleFriendPresence(pollId, onlineNicks),
  },
  join: {
    enumerable: true,
    value: (channel: string, sourceTarget?: string, options?: { visiblePending?: boolean } | string) =>
      connection.ports.command.join(channel, sourceTarget, options),
  },
  part: {
    enumerable: true,
    value: (channel: string, reason?: string, sourceTarget?: string) =>
      connection.ports.command.part(channel, reason, sourceTarget),
  },
  say: { enumerable: true, value: (target: string, text: string, sourceTarget?: string) => connection.ports.command.say(target, text, sourceTarget) },
  action: { enumerable: true, value: (target: string, text: string, sourceTarget?: string) => connection.ports.command.action(target, text, sourceTarget) },
  setNick: { enumerable: true, value: (nick: string, sourceTarget?: string) => connection.ports.command.setNick(nick, sourceTarget) },
  consumeReplyTarget: {
    enumerable: true,
    value: (command: string, params: string[], nick: string | null, rawTarget?: string) =>
      connection.ports.reply.consumeReplyTarget(command, params, nick, rawTarget),
  },
  queueReplyContext: { enumerable: true, value: (context: PendingReplyContext) => connection.ports.reply.queueReplyContext(context) },
  prunePendingReplyContexts: { enumerable: true, value: () => connection.ports.reply.prunePendingReplyContexts() },
  refreshFriendPresence: { enumerable: true, value: () => connection.ports.friendPresence.refreshFriendPresence() },
  finishChannelListRequest: { enumerable: true, value: (requestId: string) => connection.ports.channelList.finishChannelListRequest(requestId) },
  getChannelListRequestFailureMessage: { enumerable: true, value: () => connection.ports.channelList.getChannelListRequestFailureMessage() },
  getActiveChannelListSnapshot: { enumerable: true, value: () => connection.ports.channelList.getActiveChannelListSnapshot() },
  handleChannelListNumeric: {
    enumerable: true,
    value: (command: string, params: string[]) => connection.ports.channelList.handleChannelListNumeric(command, params),
  },
  handleSelfChannelDeparture: { enumerable: true, value: (channel: string) => connection.ports.channels.handleSelfChannelDeparture(channel) },
  recordChannelListEntry: {
    enumerable: true,
    value: (requestId: string, entry: ChannelListEntry) => connection.ports.channelList.recordChannelListEntry(requestId, entry),
  },
  requestChannelList: { enumerable: true, value: (requestId: string) => connection.ports.channelList.requestChannelList(requestId) },
  resetTransientState: { enumerable: true, value: () => connection.ports.lifecycle.resetTransientState() },
  markConnectionFailure: { enumerable: true, value: (detail: string) => connection.ports.lifecycle.markConnectionFailure(detail) },
  markRegistered: {
    enumerable: true,
    value: (serverName: string | null, nick: string | null) => connection.ports.lifecycle.markRegistered(serverName, nick),
  },
  openSocket: { enumerable: true, value: (socket: IrcSocket) => connection.ports.lifecycle.openSocket(socket) },
  handleSocketClosed: { enumerable: true, value: (socket: IrcSocket) => connection.ports.lifecycle.handleSocketClosed(socket) },
  setConnectDeadlineTimer: {
    enumerable: true,
    value: (timer: ReturnType<typeof setTimeout>) => connection.ports.lifecycle.setConnectDeadlineTimer(timer),
  },
  sendRaw: { enumerable: true, value: (raw: string, statusTarget?: string) => connection.ports.transport.sendRaw(raw, statusTarget) },
  sendClientRaw: { enumerable: true, value: (raw: string, sourceTarget?: string) => connection.ports.transport.sendClientRaw(raw, sourceTarget) },
  setFriendNicks: { enumerable: true, value: (nicks: string[]) => connection.ports.friendPresence.setFriendNicks(nicks) },
  clearFriendPresenceTimer: { enumerable: true, value: () => connection.ports.friendPresence.clearFriendPresenceTimer() },
  updateOnlineFriendKeys: { enumerable: true, value: (onlineNicks: string[]) => connection.ports.friendPresence.updateOnlineFriendKeys(onlineNicks) },
  clearExpiredChannelSessions: { enumerable: true, value: () => connection.ports.channels.clearExpiredChannelSessions() },
  clearPendingNick: { enumerable: true, value: () => connection.ports.command.clearPendingNick() },
  confirmNick: { enumerable: true, value: (newNick: string) => connection.ports.command.confirmNick(newNick) },
  applyNickFallback: {
    enumerable: true,
    value: (fallbackNick: string, options: { replyTarget?: string; updatePending: boolean }) =>
      connection.ports.command.applyNickFallback(fallbackNick, options),
  },
  getChannelSession: { enumerable: true, value: (channel: string) => connection.ports.channels.getChannelSession(channel) },
  getTrackedChannelUserEntries: { enumerable: true, value: () => connection.ports.channels.getTrackedChannelUserEntries() },
  getTrackedChannelUsers: { enumerable: true, value: (channel: string) => connection.ports.channels.getTrackedChannelUsers(channel) },
  listPendingChannels: { enumerable: true, value: () => connection.ports.channels.listPendingChannels() },
  removeChannelSession: { enumerable: true, value: (channel: string) => connection.ports.channels.removeChannelSession(channel) },
  resolveTrackedChannel: { enumerable: true, value: (channel: string) => connection.ports.channels.resolveTrackedChannel(channel) },
  setChannelSession: {
    enumerable: true,
    value: (channel: string, phase: 'joining' | 'joined' | 'leaving', options?: { sourceTarget?: string; visiblePending?: boolean; previouslyJoined?: boolean }) =>
      connection.ports.channels.setChannelSession(channel, phase, options),
  },
  setTrackedChannelUsers: { enumerable: true, value: (channel: string, users: ChannelUserState[]) => connection.ports.channels.setTrackedChannelUsers(channel, users) },
  discardPendingChannelReplyContexts: {
    enumerable: true,
    value: (channel: string, predicate?: (context: Extract<PendingReplyContext, { kind: 'channel' }>) => boolean) =>
      connection.ports.reply.discardPendingChannelReplyContexts(channel, predicate),
  },
  consumePendingNickReplyContexts: {
    enumerable: true,
    value: (requestedNick: string) => connection.ports.reply.consumePendingNickReplyContexts(requestedNick),
  },
  discardPendingNickReplyContexts: { enumerable: true, value: () => connection.ports.reply.discardPendingNickReplyContexts() },
  clearDrainingChannelList: { enumerable: true, value: () => connection.ports.channelList.clearDrainingChannelList() },
  clearActiveChannelList: { enumerable: true, value: () => connection.ports.channelList.clearActiveChannelList() },
  abortActiveChannelList: { enumerable: true, value: (message: string) => connection.ports.channelList.abortActiveChannelList(message) },
  isChannelListPending: { enumerable: true, value: () => connection.ports.channelList.isChannelListPending() },
  startChannelList: {
    enumerable: true,
    value: (mode: 'raw' | 'structured', options: { requestId?: string; sourceTarget?: string }) =>
      connection.ports.channelList.startChannelList(mode, options),
  },
  trackChannel: { enumerable: true, value: (channel: string) => connection.ports.channels.trackChannel(channel) },
  untrackChannel: { enumerable: true, value: (channel: string) => connection.ports.channels.untrackChannel(channel) },
  clearChannelSessions: { enumerable: true, value: () => connection.ports.channels.clearChannelSessions() },
  updateChannelUsers: {
    enumerable: true,
    value: (channel: string, nick: string | null, joined: boolean) =>
      connection.ports.channels.updateChannelUsers(channel, nick, joined),
  },
  updateProfile: { enumerable: true, value: (profile: RuntimeNetworkProfile) => connection.ports.lifecycle.updateProfile(profile) },
});
