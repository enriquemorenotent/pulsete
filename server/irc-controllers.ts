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
  discardPendingChannelReplyContexts,
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
import { createChannelReplyContext, createMessageReplyContext, createNickReplyContext, type PendingReplyContext } from './irc-reply-context.js';
import {
  consumePendingNickReplyContexts,
  consumeReplyContext,
  consumeReplyTarget,
  discardPendingNickReplyContexts,
  prunePendingReplyContexts,
  queueReplyContext,
} from './irc-reply-state.js';
import type { IrcConnection } from './irc.js';
import type { ChannelListEntry, ChannelUserState, NetworkRuntimeState } from '../shared/protocol.js';
import type { ChannelSessionPhase, IrcSocket } from './irc-types.js';
import type { RuntimeNetworkProfile } from './storage-types.js';

export class IrcLifecycleController {
  constructor(private readonly connection: IrcConnection) {}
  get state(): Pick<NetworkRuntimeState, 'phase' | 'serverName' | 'nick'> {
    const { lifecycle } = this.connection;
    return { phase: lifecycle.connected ? 'connected' : lifecycle.socket ? 'connecting' : 'offline', serverName: lifecycle.serverName, nick: lifecycle.currentNick };
  }
  openSocket(socket: IrcSocket) { openSocket(this.connection, socket); }
  beginLogin() { beginLogin(this.connection); }
  setConnectDeadlineTimer(timer: ReturnType<typeof setTimeout>) { setConnectDeadlineTimer(this.connection, timer); }
  markConnectionFailure(detail: string) { markConnectionFailure(this.connection, detail); }
  handleSocketClosed(socket: IrcSocket) { handleSocketClosed(this.connection, socket); }
  markRegistered(serverName: string | null, nick: string | null) { markRegistered(this.connection, serverName, nick); }
  connect(resetRetryBudget = true) { connect(this.connection, resetRetryBudget); }
  disconnect(raw = 'QUIT :Client disconnecting') { disconnect(this.connection, raw); }
  updateProfile(profile: RuntimeNetworkProfile) { updateProfile(this.connection, profile); }
  clearReconnectTimer() { clearReconnectTimer(this.connection); }
  clearConnectDeadlineTimer() { clearConnectDeadlineTimer(this.connection); }
  resetTransientState() { resetTransientState(this.connection); }
}

export class IrcCommandController {
  constructor(private readonly connection: IrcConnection) {}
  join(channel: string, sourceTarget = 'server', options: { visiblePending?: boolean } | string = {}) {
    if (!this.connection.connected) {
      emitStatus(this.connection, this.connection.socket ? 'Still connecting to server' : 'Not connected', 'error', sourceTarget);
      return false;
    }
    if (!this.connection.sendRaw(`JOIN ${channel}`, sourceTarget)) {
      return false;
    }
    const visiblePending = typeof options === 'string' ? false : options.visiblePending ?? false;
    this.connection.setChannelSession(channel, 'joining', { sourceTarget, visiblePending });
    return true;
  }

  part(channel: string, reason = 'Leaving', sourceTarget = channel) {
    if (this.connection.getChannelSession(channel)?.phase === 'joined') {
      this.connection.setChannelSession(channel, 'leaving', { sourceTarget, visiblePending: false });
    }
    return sendTrackedRaw(
      this.connection,
      `PART ${channel} :${reason}`,
      sourceTarget,
      createChannelReplyContext(sourceTarget, channel, 'part')
    );
  }
  say(target: string, text: string, sourceTarget = target) {
    if (sendTrackedRaw(this.connection, `PRIVMSG ${target} :${text}`, sourceTarget, createMessageReplyContext(sourceTarget, target))) {
      emitMessage(this.connection, createSelfMessage(this.connection, target, text));
    }
  }
  action(target: string, text: string, sourceTarget = target) {
    if (sendTrackedRaw(this.connection, `PRIVMSG ${target} :\u0001ACTION ${text}\u0001`, sourceTarget, createMessageReplyContext(sourceTarget, target))) {
      emitMessage(this.connection, createSelfMessage(this.connection, target, `* ${this.connection.currentNick} ${text}`));
    }
  }
  setNick(nick: string, sourceTarget = 'server') {
    if (!this.connection.connected) {
      emitStatus(this.connection, this.connection.socket ? 'Still connecting to server' : 'Not connected', 'error', sourceTarget);
      return false;
    }
    return sendTrackedRaw(this.connection, `NICK ${nick}`, sourceTarget, createNickReplyContext(sourceTarget, nick));
  }
  clearPendingNick() { this.connection.replyTracker.clearPendingNick(); }
  applyNickFallback(fallbackNick: string, options: { replyTarget?: string; updatePending: boolean }) {
    if (options.updatePending) {
      this.connection.pendingNick = fallbackNick;
    } else {
      this.connection.currentNick = fallbackNick;
    }
    if (options.replyTarget) {
      this.connection.queueReplyContext(createNickReplyContext(options.replyTarget, fallbackNick));
    }
  }
  confirmNick(newNick: string) {
    this.connection.consumePendingNickReplyContexts(newNick);
    this.connection.currentNick = newNick;
    emitState(this.connection);
  }
}

export class IrcFriendPresenceController {
  constructor(private readonly connection: IrcConnection) {}
  setFriendNicks(nicks: string[]) { setFriendNicks(this.connection, nicks); }
  refreshFriendPresence() { refreshFriendPresence(this.connection); }
  handleFriendPresence(pollId: number, onlineNicks: string[]) { handleFriendPresence(this.connection, pollId, onlineNicks); }
  disableFriendPresence() { disableFriendPresence(this.connection); }
  clearFriendPresenceTimer() { clearFriendPresenceTimer(this.connection); }
  updateOnlineFriendKeys(onlineNicks: string[]) { updateOnlineFriendKeys(this.connection, onlineNicks); }
}

export class IrcReplyController {
  constructor(private readonly connection: IrcConnection) {}
  queueReplyContext(context: PendingReplyContext) { queueReplyContext(this.connection, context); }
  consumeReplyTarget(command: string, params: string[], nick: string | null, rawTarget?: string) {
    return consumeReplyTarget(this.connection, command, params, nick, rawTarget);
  }
  consumeReplyContext(command: string, params: string[], nick: string | null, rawTarget?: string) {
    return consumeReplyContext(this.connection, command, params, nick, rawTarget);
  }
  discardPendingChannelReplyContexts(
    channel: string,
    predicate?: (context: Extract<PendingReplyContext, { kind: 'channel' }>) => boolean
  ) {
    return discardPendingChannelReplyContexts(this.connection, channel, predicate);
  }
  consumePendingNickReplyContexts(requestedNick: string) { return consumePendingNickReplyContexts(this.connection, requestedNick); }
  discardPendingNickReplyContexts() { return discardPendingNickReplyContexts(this.connection); }
  prunePendingReplyContexts() { prunePendingReplyContexts(this.connection); }
}

export class IrcTransportController {
  constructor(private readonly connection: IrcConnection) {}
  sendRaw(raw: string, statusTarget?: string) { return sendRaw(this.connection, raw, statusTarget); }
  sendClientRaw(raw: string, sourceTarget = 'server') { return sendClientRaw(this.connection, raw, sourceTarget); }
  consume(chunk: string) { consume(this.connection, chunk); }
}

export class IrcChannelListController {
  constructor(private readonly connection: IrcConnection) {}
  requestChannelList(requestId: string) { return requestChannelList(this.connection, requestId); }
  recordChannelListEntry(requestId: string, entry: ChannelListEntry) { recordChannelListEntry(this.connection, requestId, entry); }
  finishChannelListRequest(requestId: string) { finishChannelListRequest(this.connection, requestId); }
  getChannelListRequestFailureMessage() { return getChannelListRequestFailureMessage(this.connection); }
  getActiveChannelListSnapshot() { return getActiveChannelListSnapshot(this.connection); }
  handleChannelListNumeric(command: string, params: string[]) { return handleChannelListNumeric(this.connection, command, params); }
  clearActiveChannelList() { clearActiveChannelList(this.connection); }
  abortActiveChannelList(message: string) { abortActiveChannelList(this.connection, message); }
  clearDrainingChannelList() { clearDrainingChannelList(this.connection); }
  isChannelListPending() { return isChannelListPending(this.connection); }
  startChannelList(mode: 'raw' | 'structured', options: { requestId?: string; sourceTarget?: string }) { startChannelList(this.connection, mode, options); }
}

export class IrcChannelController {
  constructor(private readonly connection: IrcConnection) {}
  updateChannelUsers(channel: string, nick: string | null, joined: boolean) {
    return updateChannelUsers(this.connection, channel, nick, joined);
  }
  getTrackedChannelUsers(channel: string) { return getTrackedChannelUsers(this.connection, channel); }
  setTrackedChannelUsers(channel: string, users: ChannelUserState[]) { return setTrackedChannelUsers(this.connection, channel, users); }
  getTrackedChannelUserEntries() { return getTrackedChannelUserEntries(this.connection); }
  resolveTrackedChannel(channel: string) { return resolveTrackedChannel(this.connection, channel); }
  clearExpiredChannelSessions() { clearExpiredChannelSessions(this.connection); }
  getChannelSession(channel: string) { return getChannelSession(this.connection, channel); }
  listPendingChannels() { return listPendingChannels(this.connection); }
  trackChannel(channel: string) { return trackChannel(this.connection, channel); }
  untrackChannel(channel: string) { return untrackChannel(this.connection, channel); }
  removeChannelSession(channel: string) { return removeChannelSession(this.connection, channel); }
  handleSelfChannelDeparture(channel: string) { handleSelfChannelDeparture(this.connection, channel); }
  setChannelSession(channel: string, phase: ChannelSessionPhase, options: { sourceTarget?: string; visiblePending?: boolean; previouslyJoined?: boolean } = {}) { return setChannelSession(this.connection, channel, phase, options); }
  clearChannelSessions() { clearChannelSessions(this.connection); }
}
