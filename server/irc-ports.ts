import { emitMessage, emitState, emitStatus } from './irc-emit.js';
import { abortActiveChannelList, clearActiveChannelList, clearDrainingChannelList, finishChannelListRequest, getActiveChannelListSnapshot, getChannelListRequestFailureMessage, handleChannelListNumeric, isChannelListPending, recordChannelListEntry, requestChannelList, startChannelList } from './irc-channel-list.js';
import { clearChannelSessions, clearExpiredChannelSessions, getChannelSession, getTrackedChannelUserEntries, getTrackedChannelUsers, handleSelfChannelDeparture, listPendingChannels, removeChannelSession, resolveTrackedChannel, setChannelSession, setTrackedChannelUsers, trackChannel, untrackChannel, updateChannelUsers } from './irc-channel-state.js';
import { applyNickFallback, beginLogin, clearConnectDeadlineTimer, clearPendingNick, clearReconnectTimer, confirmNick, connect, disconnect, dispose, handleSocketClosed, markConnectionFailure, markRegistered, openSocket, resetTransientState, setConnectDeadlineTimer, updateProfile } from './irc-connection-lifecycle.js';
import { consume, createSelfMessage, sendClientRaw, sendRaw, sendTrackedRaw } from './irc-connection-io.js';
import { clearFriendPresenceTimer, disableFriendPresence, handleFriendPresence, refreshFriendPresence, setFriendNicks, updateOnlineFriendKeys } from './irc-friend-presence.js';
import type { IrcChannelListContext, IrcChannelStateContext, IrcConnectContext, IrcFriendPresenceContext, IrcLifecycleContext, IrcReplyStateContext } from './irc-contexts.js';
import type { IrcChannelListPort, IrcChannelPort, IrcCommandPort, IrcFriendPresencePort, IrcLifecyclePort, IrcReplyPort, IrcTransportPort } from './irc-port-types.js';
import { createChannelReplyContext, createMessageReplyContext, createNickReplyContext } from './irc-reply-context.js';
import { consumePendingNickReplyContexts, consumeReplyContext, consumeReplyTarget, discardPendingNickReplyContexts, prunePendingReplyContexts, queueReplyContext } from './irc-reply-state.js';
import type { NetworkRuntimeState } from '../shared/protocol.js';
import type { IrcConnectionState } from './irc-types.js';

type IrcLifecyclePortContext = IrcConnectContext;
type IrcCommandContext = IrcLifecycleContext;

export const createIrcLifecyclePort = (connection: IrcLifecyclePortContext): IrcLifecyclePort => ({
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
  dispose() { dispose(connection); },
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
    if (!connection.ports.transport.sendRaw(`JOIN ${channel}`, sourceTarget)) {
      return false;
    }
    const visiblePending = typeof options === 'string' ? false : options.visiblePending ?? false;
    connection.ports.channels.setChannelSession(channel, 'joining', { sourceTarget, visiblePending });
    return true;
  },
  part(channel, reason = 'Leaving', sourceTarget = channel) {
    if (connection.ports.channels.getChannelSession(channel)?.phase === 'joined') {
      connection.ports.channels.setChannelSession(channel, 'leaving', { sourceTarget, visiblePending: false });
    }
    return sendTrackedRaw(connection, `PART ${channel} :${reason}`, sourceTarget, createChannelReplyContext(sourceTarget, channel, 'part'));
  },
  say(target, text, sourceTarget = target) {
    if (sendTrackedRaw(connection, `PRIVMSG ${target} :${text}`, sourceTarget, createMessageReplyContext(sourceTarget, target))) {
      emitMessage(connection, createSelfMessage(connection, target, text));
    }
  },
  action(target, text, sourceTarget = target) {
    if (sendTrackedRaw(connection, `PRIVMSG ${target} :\u0001ACTION ${text}\u0001`, sourceTarget, createMessageReplyContext(sourceTarget, target))) {
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
  clearPendingNick() { clearPendingNick(connection); },
  applyNickFallback(fallbackNick, options) { applyNickFallback(connection, fallbackNick, options); },
  confirmNick(newNick) { confirmNick(connection, newNick); },
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
