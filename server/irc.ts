import type { ChannelListEntry, ChannelUserState, NetworkRuntimeState, PresenceStatus } from '../shared/protocol-chat.js';
import { snapshotIrcCapabilities } from './irc-capabilities.js';
import * as lifecycle from './irc-connection-lifecycle.js';
import * as io from './irc-connection-io.js';
import * as commands from './irc-commands.js';
import * as friends from './irc-friend-presence.js';
import * as channelLists from './irc-channel-list.js';
import * as channelState from './irc-channel-state.js';
import * as replies from './irc-reply-state.js';
import { createIrcConnectionState, type IrcConnectionOptions } from './irc-connection-state.js';
import type { PendingReplyContext } from './irc-reply-context-types.js';
import type {
  ChannelSessionPhase,
  ChannelSessionState,
  IrcChannelListState,
  IrcChannelTrackingState,
  IrcFriendPresenceState,
  IrcHistoryState,
  IrcLifecycleState,
  IrcReplyTracker,
  IrcSocket,
} from './irc-state-types.js';
import type {
  Handlers,
  IrcConnectionState,
} from './irc-types.js';
import type { RuntimeNetworkProfile } from './storage-types.js';

export class IrcConnection implements IrcConnectionState {
  readonly profile: RuntimeNetworkProfile;
  readonly handlers: Handlers;
  readonly lifecycle: IrcLifecycleState;
  readonly channels: IrcChannelTrackingState;
  readonly history: IrcHistoryState;
  readonly friendPresence: IrcFriendPresenceState;
  readonly channelList: IrcChannelListState;
  readonly replyTracker: IrcReplyTracker;

  constructor(profile: RuntimeNetworkProfile, handlers: Handlers, options: IrcConnectionOptions = {}) {
    const state = createIrcConnectionState(profile, handlers, options);
    this.profile = state.profile;
    this.handlers = state.handlers;
    this.lifecycle = state.lifecycle;
    this.channels = state.channels;
    this.history = state.history;
    this.friendPresence = state.friendPresence;
    this.channelList = state.channelList;
    this.replyTracker = state.replyTracker;
  }

  get state(): NetworkRuntimeState {
    const phase: NetworkRuntimeState['phase'] = this.lifecycle.connected
      ? 'connected'
      : this.lifecycle.socket
        ? 'connecting'
        : 'offline';
    return {
      phase,
      serverName: this.lifecycle.serverName,
      ...(this.lifecycle.vpnServer ? { vpnServer: this.lifecycle.vpnServer } : {}),
      nick: this.lifecycle.currentNick,
      capabilities: snapshotIrcCapabilities(this.lifecycle.capabilities),
    };
  }

  beginLogin() { lifecycle.beginLogin(this); }
  connect(resetRetryBudget = true) { lifecycle.connect(this, resetRetryBudget); }
  disconnect(raw?: string) { lifecycle.disconnect(this, raw); }
  dispose() { lifecycle.dispose(this); }
  updateProfile(profile: RuntimeNetworkProfile) { lifecycle.updateProfile(this, profile); }
  clearReconnectTimer() { lifecycle.clearReconnectTimer(this); }
  clearConnectDeadlineTimer() { lifecycle.clearConnectDeadlineTimer(this); }
  resetTransientState() { lifecycle.resetTransientState(this); }
  markConnectionFailure(detail: string) { lifecycle.markConnectionFailure(this, detail); }
  markRegistered(serverName: string | null, nick: string | null) { lifecycle.markRegistered(this, serverName, nick); }
  openSocket(socket: IrcSocket) { lifecycle.openSocket(this, socket); }
  handleSocketClosed(socket: IrcSocket) { lifecycle.handleSocketClosed(this, socket); }
  setConnectDeadlineTimer(timer: ReturnType<typeof setTimeout>) { lifecycle.setConnectDeadlineTimer(this, timer); }
  clearPendingNick() { lifecycle.clearPendingNick(this); }
  confirmNick(newNick: string) { lifecycle.confirmNick(this, newNick); }
  applyNickFallback(fallbackNick: string, options: { replyTarget?: string; updatePending: boolean }) {
    lifecycle.applyNickFallback(this, fallbackNick, options);
  }

  consume(chunk: string) { io.consume(this, chunk); }
  sendRaw(raw: string, statusTarget?: string) { return io.sendRaw(this, raw, statusTarget); }
  sendClientRaw(raw: string, sourceTarget?: string) { return io.sendClientRaw(this, raw, sourceTarget); }
  join(channel: string, sourceTarget = 'server', options: { visiblePending?: boolean } | string = {}) {
    return commands.join(this, channel, sourceTarget, options);
  }
  part(channel: string, reason = 'Leaving', sourceTarget = channel) { return commands.part(this, channel, reason, sourceTarget); }
  say(target: string, text: string, sourceTarget = target) { commands.say(this, target, text, sourceTarget); }
  action(target: string, text: string, sourceTarget = target) { commands.action(this, target, text, sourceTarget); }
  setNick(nick: string, sourceTarget = 'server') { return commands.setNick(this, nick, sourceTarget); }

  setFriendNicks(nicks: string[]) { friends.setFriendNicks(this, nicks); }
  refreshFriendPresence() { friends.refreshFriendPresence(this); }
  setFriendPresenceMonitorSupport(supported: boolean, limit: number | null) {
    friends.setFriendPresenceMonitorSupport(this, supported, limit);
  }
  handleFriendPresenceIsonReply(
    snapshotId: number,
    onlineNicks: string[] | null,
    unsupported: boolean,
  ) {
    friends.handleFriendPresenceIsonReply(
      this,
      snapshotId,
      onlineNicks,
      unsupported,
    );
  }
  handleFriendPresenceMonitorUpdate(
    nicks: string[],
    presence: PresenceStatus,
  ) {
    return friends.handleFriendPresenceMonitorUpdate(
      this,
      nicks,
      presence,
    );
  }
  disableFriendPresence() { friends.disableFriendPresence(this); }
  clearFriendPresenceTimer() { friends.clearFriendPresenceTimer(this); }
  updateFriendPresenceStatuses(presenceByKey: Map<string, PresenceStatus>) {
    friends.updateFriendPresenceStatuses(this, presenceByKey);
  }

  requestChannelList(requestId: string) { return channelLists.requestChannelList(this, requestId); }
  recordChannelListEntry(requestId: string, entry: ChannelListEntry) { channelLists.recordChannelListEntry(this, requestId, entry); }
  finishChannelListRequest(requestId: string) { channelLists.finishChannelListRequest(this, requestId); }
  getChannelListRequestFailureMessage() { return channelLists.getChannelListRequestFailureMessage(this); }
  getActiveChannelListSnapshot() { return channelLists.getActiveChannelListSnapshot(this); }
  handleChannelListNumeric(command: string, params: string[]) { return channelLists.handleChannelListNumeric(this, command, params); }
  clearActiveChannelList() { channelLists.clearActiveChannelList(this); }
  abortActiveChannelList(message: string) { channelLists.abortActiveChannelList(this, message); }
  clearDrainingChannelList() { channelLists.clearDrainingChannelList(this); }
  isChannelListPending() { return channelLists.isChannelListPending(this); }
  startChannelList(mode: 'raw' | 'structured', options: { requestId?: string; sourceTarget?: string }) {
    channelLists.startChannelList(this, mode, options);
  }

  listPendingChannels() { return channelState.listPendingChannels(this); }
  listReconnectChannels() { return channelState.listReconnectChannels(this); }
  trackChannel(channel: string) { return channelState.trackChannel(this, channel); }
  untrackChannel(channel: string) { channelState.untrackChannel(this, channel); }
  setReconnectChannels(channels: string[]) { channelState.setReconnectChannels(this, channels); }
  rememberReconnectChannel(channel: string) { return channelState.rememberReconnectChannel(this, channel); }
  forgetReconnectChannel(channel: string) { return channelState.forgetReconnectChannel(this, channel) ?? null; }
  getChannelSession(channel: string) { return channelState.getChannelSession(this, channel); }
  updateChannelUsers(channel: string, nick: string | null, joined: boolean, details?: Partial<ChannelUserState>) {
    return channelState.updateChannelUsers(this, channel, nick, joined, details);
  }
  getTrackedChannelUsers(channel: string) { return channelState.getTrackedChannelUsers(this, channel); }
  setTrackedChannelUsers(channel: string, users: ChannelUserState[]) {
    return channelState.setTrackedChannelUsers(this, channel, users);
  }
  getTrackedChannelUserEntries(): Array<[string, ChannelUserState[]]> { return channelState.getTrackedChannelUserEntries(this); }
  resolveTrackedChannel(channel: string) { return channelState.resolveTrackedChannel(this, channel); }
  clearExpiredChannelSessions() { channelState.clearExpiredChannelSessions(this); }
  removeChannelSession(channel: string) { return channelState.removeChannelSession(this, channel); }
  handleSelfChannelDeparture(channel: string) { channelState.handleSelfChannelDeparture(this, channel); }
  setChannelSession(
    channel: string,
    phase: ChannelSessionPhase,
    options?: { sourceTarget?: string; visiblePending?: boolean; previouslyJoined?: boolean }
  ): ChannelSessionState {
    return channelState.setChannelSession(this, channel, phase, options);
  }
  clearChannelSessions() { channelState.clearChannelSessions(this); }

  queueReplyContext(context: PendingReplyContext) { replies.queueReplyContext(this, context); }
  consumeReplyTarget(command: string, params: string[], nick: string | null, rawTarget?: string, label?: string | null) {
    return replies.consumeReplyTarget(this, command, params, nick, rawTarget, label);
  }
  consumeReplyContext(command: string, params: string[], nick: string | null, rawTarget?: string, label?: string | null) {
    return replies.consumeReplyContext(this, command, params, nick, rawTarget, label);
  }
  prunePendingReplyContexts() { replies.prunePendingReplyContexts(this); }
  discardPendingChannelReplyContexts(
    channel: string,
    predicate?: (context: Extract<PendingReplyContext, { kind: 'channel' }>) => boolean
  ) {
    return replies.discardPendingChannelReplyContexts(this, channel, predicate);
  }
  consumePendingNickReplyContexts(requestedNick: string) { return replies.consumePendingNickReplyContexts(this, requestedNick); }
  discardPendingNickReplyContexts() { return replies.discardPendingNickReplyContexts(this); }
}
