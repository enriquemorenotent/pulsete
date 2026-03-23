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
  IrcChannelController,
  IrcChannelListController,
  IrcCommandController,
  IrcConnectionState,
  IrcFriendPresenceController,
  IrcIoController,
  IrcLifecycleController,
  IrcReplyController,
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
  readonly lifecycleControl: IrcLifecycleController;
  readonly io: IrcIoController;
  readonly commands: IrcCommandController;
  readonly friendsControl: IrcFriendPresenceController;
  readonly channelLists: IrcChannelListController;
  readonly channelsControl: IrcChannelController;
  readonly replies: IrcReplyController;

  constructor(profile: RuntimeNetworkProfile, handlers: Handlers, options: IrcConnectionOptions = {}) {
    const state = createIrcConnectionState(profile, handlers, options);
    this.profile = state.profile;
    this.handlers = state.handlers;
    this.lifecycle = state.lifecycle;
    this.channels = state.channels;
    this.friendPresence = state.friendPresence;
    this.channelList = state.channelList;
    this.replyTracker = state.replyTracker;

    const controls = createIrcControllers(this);
    this.lifecycleControl = controls.lifecycleControl;
    this.io = controls.io;
    this.commands = controls.commands;
    this.friendsControl = controls.friendsControl;
    this.channelLists = controls.channelLists;
    this.channelsControl = controls.channelsControl;
    this.replies = controls.replies;
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

  beginLogin() { this.lifecycleControl.beginLogin(); }
  connect(resetRetryBudget = true) { this.lifecycleControl.connect(resetRetryBudget); }
  disconnect(raw?: string) { this.lifecycleControl.disconnect(raw); }
  dispose() { this.lifecycleControl.dispose(); }
  updateProfile(profile: RuntimeNetworkProfile) { this.lifecycleControl.updateProfile(profile); }
  clearReconnectTimer() { this.lifecycleControl.clearReconnectTimer(); }
  clearConnectDeadlineTimer() { this.lifecycleControl.clearConnectDeadlineTimer(); }
  resetTransientState() { this.lifecycleControl.resetTransientState(); }
  markConnectionFailure(detail: string) { this.lifecycleControl.markConnectionFailure(detail); }
  markRegistered(serverName: string | null, nick: string | null) { this.lifecycleControl.markRegistered(serverName, nick); }
  openSocket(socket: IrcSocket) { this.lifecycleControl.openSocket(socket); }
  handleSocketClosed(socket: IrcSocket) { this.lifecycleControl.handleSocketClosed(socket); }
  setConnectDeadlineTimer(timer: ReturnType<typeof setTimeout>) { this.lifecycleControl.setConnectDeadlineTimer(timer); }
  clearPendingNick() { this.lifecycleControl.clearPendingNick(); }
  confirmNick(newNick: string) { this.lifecycleControl.confirmNick(newNick); }
  applyNickFallback(fallbackNick: string, options: { replyTarget?: string; updatePending: boolean }) {
    this.lifecycleControl.applyNickFallback(fallbackNick, options);
  }

  consume(chunk: string) { this.io.consume(chunk); }
  sendRaw(raw: string, statusTarget?: string) { return this.io.sendRaw(raw, statusTarget); }
  sendClientRaw(raw: string, sourceTarget?: string) { return this.io.sendClientRaw(raw, sourceTarget); }
  join(channel: string, sourceTarget = 'server', options: { visiblePending?: boolean } | string = {}) {
    return this.commands.join(channel, sourceTarget, options);
  }
  part(channel: string, reason = 'Leaving', sourceTarget = channel) { return this.commands.part(channel, reason, sourceTarget); }
  say(target: string, text: string, sourceTarget = target) { this.commands.say(target, text, sourceTarget); }
  action(target: string, text: string, sourceTarget = target) { this.commands.action(target, text, sourceTarget); }
  setNick(nick: string, sourceTarget = 'server') { return this.lifecycleControl.setNick(nick, sourceTarget); }

  setFriendNicks(nicks: string[]) { this.friendsControl.setFriendNicks(nicks); }
  refreshFriendPresence() { this.friendsControl.refreshFriendPresence(); }
  handleFriendPresence(pollId: number, onlineNicks: string[]) { this.friendsControl.handleFriendPresence(pollId, onlineNicks); }
  disableFriendPresence() { this.friendsControl.disableFriendPresence(); }
  clearFriendPresenceTimer() { this.friendsControl.clearFriendPresenceTimer(); }
  updateOnlineFriendKeys(onlineNicks: string[]) { this.friendsControl.updateOnlineFriendKeys(onlineNicks); }

  requestChannelList(requestId: string) { return this.channelLists.requestChannelList(requestId); }
  recordChannelListEntry(requestId: string, entry: ChannelListEntry) { this.channelLists.recordChannelListEntry(requestId, entry); }
  finishChannelListRequest(requestId: string) { this.channelLists.finishChannelListRequest(requestId); }
  getChannelListRequestFailureMessage() { return this.channelLists.getChannelListRequestFailureMessage(); }
  getActiveChannelListSnapshot() { return this.channelLists.getActiveChannelListSnapshot(); }
  handleChannelListNumeric(command: string, params: string[]) { return this.channelLists.handleChannelListNumeric(command, params); }
  clearActiveChannelList() { this.channelLists.clearActiveChannelList(); }
  abortActiveChannelList(message: string) { this.channelLists.abortActiveChannelList(message); }
  clearDrainingChannelList() { this.channelLists.clearDrainingChannelList(); }
  isChannelListPending() { return this.channelLists.isChannelListPending(); }
  startChannelList(mode: 'raw' | 'structured', options: { requestId?: string; sourceTarget?: string }) {
    this.channelLists.startChannelList(mode, options);
  }

  listPendingChannels() { return this.channelsControl.listPendingChannels(); }
  trackChannel(channel: string) { return this.channelsControl.trackChannel(channel); }
  untrackChannel(channel: string) { this.channelsControl.untrackChannel(channel); }
  getChannelSession(channel: string) { return this.channelsControl.getChannelSession(channel); }
  updateChannelUsers(channel: string, nick: string | null, joined: boolean) {
    return this.channelsControl.updateChannelUsers(channel, nick, joined);
  }
  getTrackedChannelUsers(channel: string) { return this.channelsControl.getTrackedChannelUsers(channel); }
  setTrackedChannelUsers(channel: string, users: ChannelUserState[]) {
    return this.channelsControl.setTrackedChannelUsers(channel, users);
  }
  getTrackedChannelUserEntries(): Array<[string, ChannelUserState[]]> { return this.channelsControl.getTrackedChannelUserEntries(); }
  resolveTrackedChannel(channel: string) { return this.channelsControl.resolveTrackedChannel(channel); }
  clearExpiredChannelSessions() { this.channelsControl.clearExpiredChannelSessions(); }
  removeChannelSession(channel: string) { return this.channelsControl.removeChannelSession(channel); }
  handleSelfChannelDeparture(channel: string) { this.channelsControl.handleSelfChannelDeparture(channel); }
  setChannelSession(
    channel: string,
    phase: ChannelSessionPhase,
    options?: { sourceTarget?: string; visiblePending?: boolean; previouslyJoined?: boolean }
  ): ChannelSessionState {
    return this.channelsControl.setChannelSession(channel, phase, options);
  }
  clearChannelSessions() { this.channelsControl.clearChannelSessions(); }

  queueReplyContext(context: PendingReplyContext) { this.replies.queueReplyContext(context); }
  consumeReplyTarget(command: string, params: string[], nick: string | null, rawTarget?: string) {
    return this.replies.consumeReplyTarget(command, params, nick, rawTarget);
  }
  consumeReplyContext(command: string, params: string[], nick: string | null, rawTarget?: string) {
    return this.replies.consumeReplyContext(command, params, nick, rawTarget);
  }
  prunePendingReplyContexts() { this.replies.prunePendingReplyContexts(); }
  discardPendingChannelReplyContexts(
    channel: string,
    predicate?: (context: Extract<PendingReplyContext, { kind: 'channel' }>) => boolean
  ) {
    return this.replies.discardPendingChannelReplyContexts(channel, predicate);
  }
  consumePendingNickReplyContexts(requestedNick: string) { return this.replies.consumePendingNickReplyContexts(requestedNick); }
  discardPendingNickReplyContexts() { return this.replies.discardPendingNickReplyContexts(); }
}
