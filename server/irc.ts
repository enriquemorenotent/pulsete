import type { ChannelListEntry, ChannelUserState, NetworkRuntimeState } from '../shared/protocol.js';
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
import { createIrcConnectionState, type IrcConnectionOptions } from './irc-connection-state.js';
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
  ChannelSessionPhase,
  ChannelSessionState,
  IrcChannelListState,
  IrcChannelTrackingState,
  IrcFriendPresenceState,
  IrcLifecycleState,
  IrcReplyTracker,
  IrcSocket,
} from './irc-state-types.js';
import type { Handlers, IrcConnectionState } from './irc-types.js';
import type { RuntimeNetworkProfile } from './storage-types.js';

export class IrcConnection implements IrcConnectionState {
  readonly profile: RuntimeNetworkProfile;
  readonly handlers: Handlers;
  readonly lifecycle: IrcLifecycleState;
  readonly channels: IrcChannelTrackingState;
  readonly friendPresence: IrcFriendPresenceState;
  readonly channelList: IrcChannelListState;
  readonly replyTracker: IrcReplyTracker;

  constructor(profile: RuntimeNetworkProfile, handlers: Handlers, options: IrcConnectionOptions = {}) {
    const state = createIrcConnectionState(profile, handlers, options);
    this.profile = state.profile;
    this.handlers = state.handlers;
    this.lifecycle = state.lifecycle;
    this.channels = state.channels;
    this.friendPresence = state.friendPresence;
    this.channelList = state.channelList;
    this.replyTracker = state.replyTracker;
  }

  get state(): Pick<NetworkRuntimeState, 'phase' | 'serverName' | 'nick'> {
    const phase: NetworkRuntimeState['phase'] = this.lifecycle.connected
      ? 'connected'
      : this.lifecycle.socket
        ? 'connecting'
        : 'offline';
    return {
      phase,
      serverName: this.lifecycle.serverName,
      nick: this.lifecycle.currentNick,
    };
  }

  beginLogin() { beginLogin(this); }
  connect(resetRetryBudget = true) { connect(this, resetRetryBudget); }
  disconnect(raw?: string) { disconnect(this, raw); }
  dispose() { dispose(this); }
  updateProfile(profile: RuntimeNetworkProfile) { updateProfile(this, profile); }
  clearReconnectTimer() { clearReconnectTimer(this); }
  clearConnectDeadlineTimer() { clearConnectDeadlineTimer(this); }
  resetTransientState() { resetTransientState(this); }
  markConnectionFailure(detail: string) { markConnectionFailure(this, detail); }
  markRegistered(serverName: string | null, nick: string | null) { markRegistered(this, serverName, nick); }
  openSocket(socket: IrcSocket) { openSocket(this, socket); }
  handleSocketClosed(socket: IrcSocket) { handleSocketClosed(this, socket); }
  setConnectDeadlineTimer(timer: ReturnType<typeof setTimeout>) { setConnectDeadlineTimer(this, timer); }

  consume(chunk: string) { consume(this, chunk); }
  sendRaw(raw: string, statusTarget?: string) { return sendRaw(this, raw, statusTarget); }
  sendClientRaw(raw: string, sourceTarget?: string) { return sendClientRaw(this, raw, sourceTarget); }

  join(channel: string, sourceTarget = 'server', options: { visiblePending?: boolean } | string = {}) {
    if (!this.lifecycle.connected) {
      emitStatus(this, this.lifecycle.socket ? 'Still connecting to server' : 'Not connected', 'error', sourceTarget);
      return false;
    }
    if (!this.sendRaw(`JOIN ${channel}`, sourceTarget)) {
      return false;
    }
    const visiblePending = typeof options === 'string' ? false : options.visiblePending ?? false;
    this.setChannelSession(channel, 'joining', { sourceTarget, visiblePending });
    return true;
  }

  part(channel: string, reason = 'Leaving', sourceTarget = channel) {
    if (this.getChannelSession(channel)?.phase === 'joined') {
      this.setChannelSession(channel, 'leaving', { sourceTarget, visiblePending: false });
    }
    return sendTrackedRaw(this, `PART ${channel} :${reason}`, sourceTarget, createChannelReplyContext(sourceTarget, channel, 'part'));
  }

  say(target: string, text: string, sourceTarget = target) {
    if (sendTrackedRaw(this, `PRIVMSG ${target} :${text}`, sourceTarget, createMessageReplyContext(sourceTarget, target))) {
      emitMessage(this, createSelfMessage(this, target, text));
    }
  }

  action(target: string, text: string, sourceTarget = target) {
    if (
      sendTrackedRaw(
        this,
        `PRIVMSG ${target} :\u0001ACTION ${text}\u0001`,
        sourceTarget,
        createMessageReplyContext(sourceTarget, target)
      )
    ) {
      emitMessage(this, createSelfMessage(this, target, `* ${this.lifecycle.currentNick} ${text}`));
    }
  }

  setNick(nick: string, sourceTarget = 'server') {
    if (!this.lifecycle.connected) {
      emitStatus(this, this.lifecycle.socket ? 'Still connecting to server' : 'Not connected', 'error', sourceTarget);
      return false;
    }
    return sendTrackedRaw(this, `NICK ${nick}`, sourceTarget, createNickReplyContext(sourceTarget, nick));
  }

  clearPendingNick() { clearPendingNick(this); }
  confirmNick(newNick: string) { confirmNick(this, newNick); }
  applyNickFallback(fallbackNick: string, options: { replyTarget?: string; updatePending: boolean }) {
    applyNickFallback(this, fallbackNick, options);
  }

  setFriendNicks(nicks: string[]) { setFriendNicks(this, nicks); }
  refreshFriendPresence() { refreshFriendPresence(this); }
  handleFriendPresence(pollId: number, onlineNicks: string[]) { handleFriendPresence(this, pollId, onlineNicks); }
  disableFriendPresence() { disableFriendPresence(this); }
  clearFriendPresenceTimer() { clearFriendPresenceTimer(this); }
  updateOnlineFriendKeys(onlineNicks: string[]) { updateOnlineFriendKeys(this, onlineNicks); }

  requestChannelList(requestId: string) { return requestChannelList(this, requestId); }
  recordChannelListEntry(requestId: string, entry: ChannelListEntry) { recordChannelListEntry(this, requestId, entry); }
  finishChannelListRequest(requestId: string) { finishChannelListRequest(this, requestId); }
  getChannelListRequestFailureMessage() { return getChannelListRequestFailureMessage(this); }
  getActiveChannelListSnapshot() { return getActiveChannelListSnapshot(this); }
  handleChannelListNumeric(command: string, params: string[]) { return handleChannelListNumeric(this, command, params); }
  clearActiveChannelList() { clearActiveChannelList(this); }
  abortActiveChannelList(message: string) { abortActiveChannelList(this, message); }
  clearDrainingChannelList() { clearDrainingChannelList(this); }
  isChannelListPending() { return isChannelListPending(this); }
  startChannelList(mode: 'raw' | 'structured', options: { requestId?: string; sourceTarget?: string }) {
    startChannelList(this, mode, options);
  }

  listPendingChannels() { return listPendingChannels(this); }
  trackChannel(channel: string) { return trackChannel(this, channel); }
  untrackChannel(channel: string) { untrackChannel(this, channel); }
  getChannelSession(channel: string) { return getChannelSession(this, channel); }
  updateChannelUsers(channel: string, nick: string | null, joined: boolean) {
    return updateChannelUsers(this, channel, nick, joined);
  }
  getTrackedChannelUsers(channel: string) { return getTrackedChannelUsers(this, channel); }
  setTrackedChannelUsers(channel: string, users: ChannelUserState[]) {
    return setTrackedChannelUsers(this, channel, users);
  }
  getTrackedChannelUserEntries(): Array<[string, ChannelUserState[]]> { return getTrackedChannelUserEntries(this); }
  resolveTrackedChannel(channel: string) { return resolveTrackedChannel(this, channel); }
  clearExpiredChannelSessions() { clearExpiredChannelSessions(this); }
  removeChannelSession(channel: string) { return removeChannelSession(this, channel); }
  handleSelfChannelDeparture(channel: string) { handleSelfChannelDeparture(this, channel); }
  setChannelSession(
    channel: string,
    phase: ChannelSessionPhase,
    options?: { sourceTarget?: string; visiblePending?: boolean; previouslyJoined?: boolean }
  ): ChannelSessionState {
    return setChannelSession(this, channel, phase, options);
  }
  clearChannelSessions() { clearChannelSessions(this); }

  queueReplyContext(context: PendingReplyContext) { queueReplyContext(this, context); }
  consumeReplyTarget(command: string, params: string[], nick: string | null, rawTarget?: string) {
    return consumeReplyTarget(this, command, params, nick, rawTarget);
  }
  consumeReplyContext(command: string, params: string[], nick: string | null, rawTarget?: string) {
    return consumeReplyContext(this, command, params, nick, rawTarget);
  }
  prunePendingReplyContexts() { prunePendingReplyContexts(this); }
  discardPendingChannelReplyContexts(
    channel: string,
    predicate?: (context: Extract<PendingReplyContext, { kind: 'channel' }>) => boolean
  ) {
    return this.replyTracker.discardPendingChannelReplyContexts(channel, predicate);
  }
  consumePendingNickReplyContexts(requestedNick: string) { return consumePendingNickReplyContexts(this, requestedNick); }
  discardPendingNickReplyContexts() { return discardPendingNickReplyContexts(this); }
}
