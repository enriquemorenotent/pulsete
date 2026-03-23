import type { ChannelListEntry, ChannelUserState, NetworkRuntimeState } from '../shared/protocol.js';
import { createIrcControllers } from './irc-controls.js';
import { createIrcConnectionState, type IrcConnectionOptions } from './irc-connection-state.js';
import type { PendingReplyContext } from './irc-reply-context-types.js';
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
  readonly friendPresence: IrcFriendPresenceState;
  readonly channelList: IrcChannelListState;
  readonly replyTracker: IrcReplyTracker;
  private readonly controls: ReturnType<typeof createIrcControllers>;

  constructor(profile: RuntimeNetworkProfile, handlers: Handlers, options: IrcConnectionOptions = {}) {
    const state = createIrcConnectionState(profile, handlers, options);
    this.profile = state.profile;
    this.handlers = state.handlers;
    this.lifecycle = state.lifecycle;
    this.channels = state.channels;
    this.friendPresence = state.friendPresence;
    this.channelList = state.channelList;
    this.replyTracker = state.replyTracker;
    this.controls = createIrcControllers(this);
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

  beginLogin() { this.controls.lifecycleControl.beginLogin(); }
  connect(resetRetryBudget = true) { this.controls.lifecycleControl.connect(resetRetryBudget); }
  disconnect(raw?: string) { this.controls.lifecycleControl.disconnect(raw); }
  dispose() { this.controls.lifecycleControl.dispose(); }
  updateProfile(profile: RuntimeNetworkProfile) { this.controls.lifecycleControl.updateProfile(profile); }
  clearReconnectTimer() { this.controls.lifecycleControl.clearReconnectTimer(); }
  clearConnectDeadlineTimer() { this.controls.lifecycleControl.clearConnectDeadlineTimer(); }
  resetTransientState() { this.controls.lifecycleControl.resetTransientState(); }
  markConnectionFailure(detail: string) { this.controls.lifecycleControl.markConnectionFailure(detail); }
  markRegistered(serverName: string | null, nick: string | null) { this.controls.lifecycleControl.markRegistered(serverName, nick); }
  openSocket(socket: IrcSocket) { this.controls.lifecycleControl.openSocket(socket); }
  handleSocketClosed(socket: IrcSocket) { this.controls.lifecycleControl.handleSocketClosed(socket); }
  setConnectDeadlineTimer(timer: ReturnType<typeof setTimeout>) { this.controls.lifecycleControl.setConnectDeadlineTimer(timer); }
  clearPendingNick() { this.controls.lifecycleControl.clearPendingNick(); }
  confirmNick(newNick: string) { this.controls.lifecycleControl.confirmNick(newNick); }
  applyNickFallback(fallbackNick: string, options: { replyTarget?: string; updatePending: boolean }) {
    this.controls.lifecycleControl.applyNickFallback(fallbackNick, options);
  }

  consume(chunk: string) { this.controls.io.consume(chunk); }
  sendRaw(raw: string, statusTarget?: string) { return this.controls.io.sendRaw(raw, statusTarget); }
  sendClientRaw(raw: string, sourceTarget?: string) { return this.controls.io.sendClientRaw(raw, sourceTarget); }
  join(channel: string, sourceTarget = 'server', options: { visiblePending?: boolean } | string = {}) {
    return this.controls.commands.join(channel, sourceTarget, options);
  }
  part(channel: string, reason = 'Leaving', sourceTarget = channel) { return this.controls.commands.part(channel, reason, sourceTarget); }
  say(target: string, text: string, sourceTarget = target) { this.controls.commands.say(target, text, sourceTarget); }
  action(target: string, text: string, sourceTarget = target) { this.controls.commands.action(target, text, sourceTarget); }
  setNick(nick: string, sourceTarget = 'server') { return this.controls.lifecycleControl.setNick(nick, sourceTarget); }

  setFriendNicks(nicks: string[]) { this.controls.friendsControl.setFriendNicks(nicks); }
  refreshFriendPresence() { this.controls.friendsControl.refreshFriendPresence(); }
  handleFriendPresence(pollId: number, onlineNicks: string[]) { this.controls.friendsControl.handleFriendPresence(pollId, onlineNicks); }
  disableFriendPresence() { this.controls.friendsControl.disableFriendPresence(); }
  clearFriendPresenceTimer() { this.controls.friendsControl.clearFriendPresenceTimer(); }
  updateOnlineFriendKeys(onlineNicks: string[]) { this.controls.friendsControl.updateOnlineFriendKeys(onlineNicks); }

  requestChannelList(requestId: string) { return this.controls.channelLists.requestChannelList(requestId); }
  recordChannelListEntry(requestId: string, entry: ChannelListEntry) { this.controls.channelLists.recordChannelListEntry(requestId, entry); }
  finishChannelListRequest(requestId: string) { this.controls.channelLists.finishChannelListRequest(requestId); }
  getChannelListRequestFailureMessage() { return this.controls.channelLists.getChannelListRequestFailureMessage(); }
  getActiveChannelListSnapshot() { return this.controls.channelLists.getActiveChannelListSnapshot(); }
  handleChannelListNumeric(command: string, params: string[]) { return this.controls.channelLists.handleChannelListNumeric(command, params); }
  clearActiveChannelList() { this.controls.channelLists.clearActiveChannelList(); }
  abortActiveChannelList(message: string) { this.controls.channelLists.abortActiveChannelList(message); }
  clearDrainingChannelList() { this.controls.channelLists.clearDrainingChannelList(); }
  isChannelListPending() { return this.controls.channelLists.isChannelListPending(); }
  startChannelList(mode: 'raw' | 'structured', options: { requestId?: string; sourceTarget?: string }) {
    this.controls.channelLists.startChannelList(mode, options);
  }

  listPendingChannels() { return this.controls.channelsControl.listPendingChannels(); }
  trackChannel(channel: string) { return this.controls.channelsControl.trackChannel(channel); }
  untrackChannel(channel: string) { this.controls.channelsControl.untrackChannel(channel); }
  getChannelSession(channel: string) { return this.controls.channelsControl.getChannelSession(channel); }
  updateChannelUsers(channel: string, nick: string | null, joined: boolean) {
    return this.controls.channelsControl.updateChannelUsers(channel, nick, joined);
  }
  getTrackedChannelUsers(channel: string) { return this.controls.channelsControl.getTrackedChannelUsers(channel); }
  setTrackedChannelUsers(channel: string, users: ChannelUserState[]) {
    return this.controls.channelsControl.setTrackedChannelUsers(channel, users);
  }
  getTrackedChannelUserEntries(): Array<[string, ChannelUserState[]]> { return this.controls.channelsControl.getTrackedChannelUserEntries(); }
  resolveTrackedChannel(channel: string) { return this.controls.channelsControl.resolveTrackedChannel(channel); }
  clearExpiredChannelSessions() { this.controls.channelsControl.clearExpiredChannelSessions(); }
  removeChannelSession(channel: string) { return this.controls.channelsControl.removeChannelSession(channel); }
  handleSelfChannelDeparture(channel: string) { this.controls.channelsControl.handleSelfChannelDeparture(channel); }
  setChannelSession(
    channel: string,
    phase: ChannelSessionPhase,
    options?: { sourceTarget?: string; visiblePending?: boolean; previouslyJoined?: boolean }
  ): ChannelSessionState {
    return this.controls.channelsControl.setChannelSession(channel, phase, options);
  }
  clearChannelSessions() { this.controls.channelsControl.clearChannelSessions(); }

  queueReplyContext(context: PendingReplyContext) { this.controls.replies.queueReplyContext(context); }
  consumeReplyTarget(command: string, params: string[], nick: string | null, rawTarget?: string) {
    return this.controls.replies.consumeReplyTarget(command, params, nick, rawTarget);
  }
  consumeReplyContext(command: string, params: string[], nick: string | null, rawTarget?: string) {
    return this.controls.replies.consumeReplyContext(command, params, nick, rawTarget);
  }
  prunePendingReplyContexts() { this.controls.replies.prunePendingReplyContexts(); }
  discardPendingChannelReplyContexts(
    channel: string,
    predicate?: (context: Extract<PendingReplyContext, { kind: 'channel' }>) => boolean
  ) {
    return this.controls.replies.discardPendingChannelReplyContexts(channel, predicate);
  }
  consumePendingNickReplyContexts(requestedNick: string) { return this.controls.replies.consumePendingNickReplyContexts(requestedNick); }
  discardPendingNickReplyContexts() { return this.controls.replies.discardPendingNickReplyContexts(); }
}
