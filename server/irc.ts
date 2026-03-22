import {
  createIrcChannelListPort,
  createIrcChannelPort,
  createIrcCommandPort,
  createIrcFriendPresencePort,
  createIrcLifecyclePort,
  createIrcReplyPort,
  createIrcTransportPort,
} from './irc-ports.js';
import { createIrcConnectionState, type IrcConnectionOptions } from './irc-connection-state.js';
import type { IrcConnectionPorts } from './irc-port-types.js';
import type { ChannelListEntry, ChannelUserState, NetworkRuntimeState } from '../shared/protocol.js';
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
  readonly ports: IrcConnectionPorts;

  constructor(profile: RuntimeNetworkProfile, handlers: Handlers, options: IrcConnectionOptions = {}) {
    const state = createIrcConnectionState(profile, handlers, options);
    this.profile = state.profile;
    this.handlers = state.handlers;
    this.lifecycle = state.lifecycle;
    this.channels = state.channels;
    this.friendPresence = state.friendPresence;
    this.channelList = state.channelList;
    this.replyTracker = state.replyTracker;
    this.ports = {
      lifecycle: createIrcLifecyclePort(this),
      command: createIrcCommandPort(this),
      friendPresence: createIrcFriendPresencePort(this),
      reply: createIrcReplyPort(this),
      transport: createIrcTransportPort(this),
      channelList: createIrcChannelListPort(this),
      channels: createIrcChannelPort(this),
    };
  }

  get state(): Pick<NetworkRuntimeState, 'phase' | 'serverName' | 'nick'> {
    return this.ports.lifecycle.state;
  }

  beginLogin() { this.ports.lifecycle.beginLogin(); }
  connect(resetRetryBudget = true) { this.ports.lifecycle.connect(resetRetryBudget); }
  disconnect(raw?: string) { this.ports.lifecycle.disconnect(raw); }
  dispose() { this.ports.lifecycle.dispose(); }
  updateProfile(profile: RuntimeNetworkProfile) { this.ports.lifecycle.updateProfile(profile); }
  clearReconnectTimer() { this.ports.lifecycle.clearReconnectTimer(); }
  clearConnectDeadlineTimer() { this.ports.lifecycle.clearConnectDeadlineTimer(); }
  resetTransientState() { this.ports.lifecycle.resetTransientState(); }
  markConnectionFailure(detail: string) { this.ports.lifecycle.markConnectionFailure(detail); }
  markRegistered(serverName: string | null, nick: string | null) { this.ports.lifecycle.markRegistered(serverName, nick); }
  openSocket(socket: IrcSocket) { this.ports.lifecycle.openSocket(socket); }
  handleSocketClosed(socket: IrcSocket) { this.ports.lifecycle.handleSocketClosed(socket); }
  setConnectDeadlineTimer(timer: ReturnType<typeof setTimeout>) { this.ports.lifecycle.setConnectDeadlineTimer(timer); }

  consume(chunk: string) { this.ports.transport.consume(chunk); }
  sendRaw(raw: string, statusTarget?: string) { return this.ports.transport.sendRaw(raw, statusTarget); }
  sendClientRaw(raw: string, sourceTarget?: string) { return this.ports.transport.sendClientRaw(raw, sourceTarget); }

  join(channel: string, sourceTarget?: string, options?: { visiblePending?: boolean } | string) {
    return this.ports.command.join(channel, sourceTarget, options);
  }
  part(channel: string, reason?: string, sourceTarget?: string) {
    return this.ports.command.part(channel, reason, sourceTarget);
  }
  say(target: string, text: string, sourceTarget?: string) { this.ports.command.say(target, text, sourceTarget); }
  action(target: string, text: string, sourceTarget?: string) { this.ports.command.action(target, text, sourceTarget); }
  setNick(nick: string, sourceTarget?: string) { return this.ports.command.setNick(nick, sourceTarget); }
  clearPendingNick() { this.ports.command.clearPendingNick(); }
  confirmNick(newNick: string) { this.ports.command.confirmNick(newNick); }
  applyNickFallback(fallbackNick: string, options: { replyTarget?: string; updatePending: boolean }) {
    this.ports.command.applyNickFallback(fallbackNick, options);
  }
  setFriendNicks(nicks: string[]) { this.ports.friendPresence.setFriendNicks(nicks); }
  refreshFriendPresence() { this.ports.friendPresence.refreshFriendPresence(); }
  handleFriendPresence(pollId: number, onlineNicks: string[]) {
    this.ports.friendPresence.handleFriendPresence(pollId, onlineNicks);
  }
  disableFriendPresence() { this.ports.friendPresence.disableFriendPresence(); }
  clearFriendPresenceTimer() { this.ports.friendPresence.clearFriendPresenceTimer(); }
  updateOnlineFriendKeys(onlineNicks: string[]) { this.ports.friendPresence.updateOnlineFriendKeys(onlineNicks); }

  requestChannelList(requestId: string) { return this.ports.channelList.requestChannelList(requestId); }
  recordChannelListEntry(requestId: string, entry: ChannelListEntry) {
    this.ports.channelList.recordChannelListEntry(requestId, entry);
  }
  finishChannelListRequest(requestId: string) { this.ports.channelList.finishChannelListRequest(requestId); }
  getChannelListRequestFailureMessage() { return this.ports.channelList.getChannelListRequestFailureMessage(); }
  getActiveChannelListSnapshot() { return this.ports.channelList.getActiveChannelListSnapshot(); }
  handleChannelListNumeric(command: string, params: string[]) { return this.ports.channelList.handleChannelListNumeric(command, params); }
  clearActiveChannelList() { this.ports.channelList.clearActiveChannelList(); }
  abortActiveChannelList(message: string) { this.ports.channelList.abortActiveChannelList(message); }
  clearDrainingChannelList() { this.ports.channelList.clearDrainingChannelList(); }
  isChannelListPending() { return this.ports.channelList.isChannelListPending(); }
  startChannelList(mode: 'raw' | 'structured', options: { requestId?: string; sourceTarget?: string }) {
    this.ports.channelList.startChannelList(mode, options);
  }
  listPendingChannels() { return this.ports.channels.listPendingChannels(); }
  trackChannel(channel: string) { return this.ports.channels.trackChannel(channel); }
  untrackChannel(channel: string) { this.ports.channels.untrackChannel(channel); }
  getChannelSession(channel: string) { return this.ports.channels.getChannelSession(channel); }
  updateChannelUsers(channel: string, nick: string | null, joined: boolean) {
    return this.ports.channels.updateChannelUsers(channel, nick, joined);
  }
  getTrackedChannelUsers(channel: string) { return this.ports.channels.getTrackedChannelUsers(channel); }
  setTrackedChannelUsers(channel: string, users: ChannelUserState[]) {
    return this.ports.channels.setTrackedChannelUsers(channel, users);
  }
  getTrackedChannelUserEntries(): Array<[string, ChannelUserState[]]> {
    return this.ports.channels.getTrackedChannelUserEntries();
  }
  resolveTrackedChannel(channel: string) { return this.ports.channels.resolveTrackedChannel(channel); }
  clearExpiredChannelSessions() { this.ports.channels.clearExpiredChannelSessions(); }
  removeChannelSession(channel: string) { return this.ports.channels.removeChannelSession(channel); }
  handleSelfChannelDeparture(channel: string) { this.ports.channels.handleSelfChannelDeparture(channel); }
  setChannelSession(
    channel: string,
    phase: ChannelSessionPhase,
    options?: { sourceTarget?: string; visiblePending?: boolean; previouslyJoined?: boolean }
  ): ChannelSessionState {
    return this.ports.channels.setChannelSession(channel, phase, options);
  }
  clearChannelSessions() { this.ports.channels.clearChannelSessions(); }
  queueReplyContext(context: PendingReplyContext) { this.ports.reply.queueReplyContext(context); }
  consumeReplyTarget(command: string, params: string[], nick: string | null, rawTarget?: string) {
    return this.ports.reply.consumeReplyTarget(command, params, nick, rawTarget);
  }
  consumeReplyContext(command: string, params: string[], nick: string | null, rawTarget?: string) {
    return this.ports.reply.consumeReplyContext(command, params, nick, rawTarget);
  }
  prunePendingReplyContexts() { this.ports.reply.prunePendingReplyContexts(); }
  discardPendingChannelReplyContexts(
    channel: string,
    predicate?: (context: Extract<PendingReplyContext, { kind: 'channel' }>) => boolean
  ) {
    return this.ports.reply.discardPendingChannelReplyContexts(channel, predicate);
  }
  consumePendingNickReplyContexts(requestedNick: string) {
    return this.ports.reply.consumePendingNickReplyContexts(requestedNick);
  }
  discardPendingNickReplyContexts() { return this.ports.reply.discardPendingNickReplyContexts(); }
}
