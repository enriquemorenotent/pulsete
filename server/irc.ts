import type { PendingReplyContext } from './irc-reply-context-types.js';
import {
  createIrcChannelListPort,
  createIrcChannelPort,
  createIrcCommandPort,
  createIrcFriendPresencePort,
  createIrcLifecyclePort,
  createIrcReplyPort,
  createIrcTransportPort,
  createRuntimeIrcSession,
  type IrcChannelListPort,
  type IrcChannelPort,
  type IrcCommandPort,
  type IrcFriendPresencePort,
  type IrcLifecyclePort,
  type IrcReplyPort,
  type IrcTransportPort,
  type RuntimeIrcSession,
} from './irc-ports.js';
import { ReplyTracker } from './irc-reply-tracker.js';
import type { ChannelListEntry, ChannelUserState } from '../shared/protocol.js';
import type {
  ChannelSessionPhase,
  ChannelSessionState,
  Handlers,
  IrcChannelListState,
  IrcChannelTrackingState,
  IrcConnectionState,
  IrcFriendPresenceState,
  IrcLifecycleState,
  IrcSocket,
} from './irc-types.js';
import type { RuntimeNetworkProfile } from './storage-types.js';

const defaultChannelJoinTimeoutMs = 15_000;
const defaultChannelListTimeoutMs = 60_000;
const defaultChannelListDrainGraceMs = 15_000;

type IrcConnectionOptions = {
  channelJoinTimeoutMs?: number;
  channelListTimeoutMs?: number;
  channelListDrainGraceMs?: number;
};

export class IrcConnection implements IrcConnectionState {
  profile: RuntimeNetworkProfile;
  readonly lifecycle: IrcLifecycleState;
  readonly channels: IrcChannelTrackingState;
  readonly friendPresence: IrcFriendPresenceState;
  readonly channelList: IrcChannelListState;
  readonly replyTracker = new ReplyTracker();
  readonly lifecyclePort: IrcLifecyclePort;
  readonly commandPort: IrcCommandPort;
  readonly friendPresencePort: IrcFriendPresencePort;
  readonly replyPort: IrcReplyPort;
  readonly transportPort: IrcTransportPort;
  readonly channelListPort: IrcChannelListPort;
  readonly channelPort: IrcChannelPort;
  readonly runtimeSession: RuntimeIrcSession;

  constructor(profile: RuntimeNetworkProfile, readonly handlers: Handlers, options: IrcConnectionOptions = {}) {
    this.profile = profile;
    this.lifecycle = {
      socket: null,
      buffer: '',
      connectDeadlineTimer: null,
      manualDisconnect: false,
      reconnectAttempts: 0,
      reconnectTimer: null,
      connected: false,
      serverName: null,
      currentNick: profile.nick,
      lastFailureMessage: null,
    };
    this.channels = {
      users: new Map<string, ChannelUserState[]>(),
      sessions: new Map<string, ChannelSessionState>(),
      joinTimeoutMs: options.channelJoinTimeoutMs ?? defaultChannelJoinTimeoutMs,
    };
    this.friendPresence = {
      nicks: [],
      onlineKeys: new Set<string>(),
      timer: null,
      pendingPoll: null,
      nextPollId: 0,
      enabled: true,
    };
    this.channelList = {
      active: {
        mode: null,
        sourceTarget: null,
        requestId: null,
        entries: [],
      },
      draining: {
        mode: null,
        sourceTarget: null,
        requestId: null,
        expiresAt: null,
      },
      timeoutTimer: null,
      timeoutMs: options.channelListTimeoutMs ?? defaultChannelListTimeoutMs,
      drainGraceMs: options.channelListDrainGraceMs ?? defaultChannelListDrainGraceMs,
    };
    this.lifecyclePort = createIrcLifecyclePort(this);
    this.commandPort = createIrcCommandPort(this);
    this.friendPresencePort = createIrcFriendPresencePort(this);
    this.replyPort = createIrcReplyPort(this);
    this.transportPort = createIrcTransportPort(this);
    this.channelListPort = createIrcChannelListPort(this);
    this.channelPort = createIrcChannelPort(this);
    this.runtimeSession = createRuntimeIrcSession(this);
  }

  get state() { return this.lifecyclePort.state; }
  get socket() { return this.lifecycle.socket; }
  set socket(value: IrcSocket | null) { this.lifecycle.socket = value; }
  get buffer() { return this.lifecycle.buffer; }
  set buffer(value: string) { this.lifecycle.buffer = value; }
  get channelUsers() { return this.channels.users; }
  get channelSessions() { return this.channels.sessions; }
  get connectDeadlineTimer() { return this.lifecycle.connectDeadlineTimer; }
  set connectDeadlineTimer(value: ReturnType<typeof setTimeout> | null) { this.lifecycle.connectDeadlineTimer = value; }
  get friendNicks() { return this.friendPresence.nicks; }
  set friendNicks(value: string[]) { this.friendPresence.nicks = value; }
  get onlineFriendKeys() { return this.friendPresence.onlineKeys; }
  set onlineFriendKeys(value: Set<string>) { this.friendPresence.onlineKeys = value; }
  get friendPresenceTimer() { return this.friendPresence.timer; }
  set friendPresenceTimer(value: ReturnType<typeof setInterval> | null) { this.friendPresence.timer = value; }
  get pendingFriendPresencePoll() { return this.friendPresence.pendingPoll; }
  set pendingFriendPresencePoll(value: { id: number; remainingResponses: number; onlineNicks: string[] } | null) { this.friendPresence.pendingPoll = value; }
  get nextFriendPresencePollId() { return this.friendPresence.nextPollId; }
  set nextFriendPresencePollId(value: number) { this.friendPresence.nextPollId = value; }
  get friendPresenceEnabled() { return this.friendPresence.enabled; }
  set friendPresenceEnabled(value: boolean) { this.friendPresence.enabled = value; }
  get manualDisconnect() { return this.lifecycle.manualDisconnect; }
  set manualDisconnect(value: boolean) { this.lifecycle.manualDisconnect = value; }
  get reconnectAttempts() { return this.lifecycle.reconnectAttempts; }
  set reconnectAttempts(value: number) { this.lifecycle.reconnectAttempts = value; }
  get reconnectTimer() { return this.lifecycle.reconnectTimer; }
  set reconnectTimer(value: ReturnType<typeof setTimeout> | null) { this.lifecycle.reconnectTimer = value; }
  get connected() { return this.lifecycle.connected; }
  set connected(value: boolean) { this.lifecycle.connected = value; }
  get serverName() { return this.lifecycle.serverName; }
  set serverName(value: string | null) { this.lifecycle.serverName = value; }
  get currentNick() { return this.lifecycle.currentNick; }
  set currentNick(value: string) { this.lifecycle.currentNick = value; }
  get activeChannelListMode() { return this.channelList.active.mode; }
  set activeChannelListMode(value: 'raw' | 'structured' | null) { this.channelList.active.mode = value; }
  get activeChannelListSourceTarget() { return this.channelList.active.sourceTarget; }
  set activeChannelListSourceTarget(value: string | null) { this.channelList.active.sourceTarget = value; }
  get activeChannelListRequestId() { return this.channelList.active.requestId; }
  set activeChannelListRequestId(value: string | null) { this.channelList.active.requestId = value; }
  get activeChannelListEntries() { return this.channelList.active.entries; }
  set activeChannelListEntries(value: ChannelListEntry[]) { this.channelList.active.entries = value; }
  get drainingChannelListMode() { return this.channelList.draining.mode; }
  set drainingChannelListMode(value: 'raw' | 'structured' | null) { this.channelList.draining.mode = value; }
  get drainingChannelListSourceTarget() { return this.channelList.draining.sourceTarget; }
  set drainingChannelListSourceTarget(value: string | null) { this.channelList.draining.sourceTarget = value; }
  get drainingChannelListRequestId() { return this.channelList.draining.requestId; }
  set drainingChannelListRequestId(value: string | null) { this.channelList.draining.requestId = value; }
  get lastFailureMessage() { return this.lifecycle.lastFailureMessage; }
  set lastFailureMessage(value: string | null) { this.lifecycle.lastFailureMessage = value; }
  get channelJoinTimeoutMs() { return this.channels.joinTimeoutMs; }
  get channelListTimeoutTimer() { return this.channelList.timeoutTimer; }
  set channelListTimeoutTimer(value: ReturnType<typeof setTimeout> | null) { this.channelList.timeoutTimer = value; }
  get drainingChannelListExpiresAt() { return this.channelList.draining.expiresAt; }
  set drainingChannelListExpiresAt(value: number | null) { this.channelList.draining.expiresAt = value; }
  get channelListTimeoutMs() { return this.channelList.timeoutMs; }
  get channelListDrainGraceMs() { return this.channelList.drainGraceMs; }
  get pendingNick() { return this.replyTracker.pendingNick; }
  set pendingNick(value: string | null) { this.replyTracker.setPendingNick(value); }
  get pendingReplyContexts(): readonly PendingReplyContext[] { return this.replyTracker.pendingReplyContexts; }

  openSocket(socket: IrcSocket) { this.lifecyclePort.openSocket(socket); }
  beginLogin() { this.lifecyclePort.beginLogin(); }
  setConnectDeadlineTimer(timer: ReturnType<typeof setTimeout>) { this.lifecyclePort.setConnectDeadlineTimer(timer); }
  markConnectionFailure(detail: string) { this.lifecyclePort.markConnectionFailure(detail); }
  handleSocketClosed(socket: IrcSocket) { this.lifecyclePort.handleSocketClosed(socket); }
  markRegistered(serverName: string | null, nick: string | null) { this.lifecyclePort.markRegistered(serverName, nick); }
  connect(resetRetryBudget = true) { this.lifecyclePort.connect(resetRetryBudget); }
  disconnect(raw = 'QUIT :Client disconnecting') { this.lifecyclePort.disconnect(raw); }
  updateProfile(profile: RuntimeNetworkProfile) { this.lifecyclePort.updateProfile(profile); }
  clearReconnectTimer() { this.lifecyclePort.clearReconnectTimer(); }
  clearConnectDeadlineTimer() { this.lifecyclePort.clearConnectDeadlineTimer(); }
  resetTransientState() { this.lifecyclePort.resetTransientState(); }
  clearPendingNick() { this.commandPort.clearPendingNick(); }
  applyNickFallback(fallbackNick: string, options: { replyTarget?: string; updatePending: boolean }) {
    this.commandPort.applyNickFallback(fallbackNick, options);
  }
  confirmNick(newNick: string) { this.commandPort.confirmNick(newNick); }

  join(channel: string, sourceTarget = 'server', options: { visiblePending?: boolean } | string = {}): boolean {
    return this.commandPort.join(channel, sourceTarget, options);
  }
  part(channel: string, reason = 'Leaving', sourceTarget = channel) { return this.commandPort.part(channel, reason, sourceTarget); }
  say(target: string, text: string, sourceTarget = target) { this.commandPort.say(target, text, sourceTarget); }
  action(target: string, text: string, sourceTarget = target) { this.commandPort.action(target, text, sourceTarget); }
  setNick(nick: string, sourceTarget = 'server') { return this.commandPort.setNick(nick, sourceTarget); }

  setFriendNicks(nicks: string[]) { this.friendPresencePort.setFriendNicks(nicks); }
  refreshFriendPresence() { this.friendPresencePort.refreshFriendPresence(); }
  handleFriendPresence(pollId: number, onlineNicks: string[]) { this.friendPresencePort.handleFriendPresence(pollId, onlineNicks); }
  disableFriendPresence() { this.friendPresencePort.disableFriendPresence(); }
  clearFriendPresenceTimer() { this.friendPresencePort.clearFriendPresenceTimer(); }
  updateOnlineFriendKeys(onlineNicks: string[]) { this.friendPresencePort.updateOnlineFriendKeys(onlineNicks); }

  queueReplyContext(context: PendingReplyContext) { this.replyPort.queueReplyContext(context); }
  consumeReplyTarget(command: string, params: string[], nick: string | null, rawTarget?: string) {
    return this.replyPort.consumeReplyTarget(command, params, nick, rawTarget);
  }
  consumeReplyContext(command: string, params: string[], nick: string | null, rawTarget?: string) {
    return this.replyPort.consumeReplyContext(command, params, nick, rawTarget);
  }
  discardPendingChannelReplyContexts(
    channel: string,
    predicate?: (context: Extract<PendingReplyContext, { kind: 'channel' }>) => boolean
  ) {
    return this.replyPort.discardPendingChannelReplyContexts(channel, predicate);
  }
  consumePendingNickReplyContexts(requestedNick: string) { return this.replyPort.consumePendingNickReplyContexts(requestedNick); }
  discardPendingNickReplyContexts() { return this.replyPort.discardPendingNickReplyContexts(); }
  prunePendingReplyContexts() { this.replyPort.prunePendingReplyContexts(); }

  sendRaw(raw: string, statusTarget?: string) { return this.transportPort.sendRaw(raw, statusTarget); }
  sendClientRaw(raw: string, sourceTarget = 'server'): boolean { return this.transportPort.sendClientRaw(raw, sourceTarget); }
  consume(chunk: string) { this.transportPort.consume(chunk); }

  requestChannelList(requestId: string) { return this.channelListPort.requestChannelList(requestId); }
  recordChannelListEntry(requestId: string, entry: ChannelListEntry) { this.channelListPort.recordChannelListEntry(requestId, entry); }
  finishChannelListRequest(requestId: string) { this.channelListPort.finishChannelListRequest(requestId); }
  getChannelListRequestFailureMessage() { return this.channelListPort.getChannelListRequestFailureMessage(); }
  getActiveChannelListSnapshot() { return this.channelListPort.getActiveChannelListSnapshot(); }
  handleChannelListNumeric(command: string, params: string[]) { return this.channelListPort.handleChannelListNumeric(command, params); }
  clearActiveChannelList() { this.channelListPort.clearActiveChannelList(); }
  abortActiveChannelList(message: string) { this.channelListPort.abortActiveChannelList(message); }
  clearDrainingChannelList() { this.channelListPort.clearDrainingChannelList(); }
  isChannelListPending() { return this.channelListPort.isChannelListPending(); }
  startChannelList(mode: 'raw' | 'structured', options: { requestId?: string; sourceTarget?: string }) {
    this.channelListPort.startChannelList(mode, options);
  }

  updateChannelUsers(channel: string, nick: string | null, joined: boolean) { return this.channelPort.updateChannelUsers(channel, nick, joined); }
  getTrackedChannelUsers(channel: string) { return this.channelPort.getTrackedChannelUsers(channel); }
  setTrackedChannelUsers(channel: string, users: ChannelUserState[]) { return this.channelPort.setTrackedChannelUsers(channel, users); }
  getTrackedChannelUserEntries() { return this.channelPort.getTrackedChannelUserEntries(); }
  resolveTrackedChannel(channel: string) { return this.channelPort.resolveTrackedChannel(channel); }
  clearExpiredChannelSessions() { this.channelPort.clearExpiredChannelSessions(); }
  getChannelSession(channel: string) { return this.channelPort.getChannelSession(channel); }
  listPendingChannels() { return this.channelPort.listPendingChannels(); }
  trackChannel(channel: string) { return this.channelPort.trackChannel(channel); }
  untrackChannel(channel: string) { this.channelPort.untrackChannel(channel); }
  removeChannelSession(channel: string) { return this.channelPort.removeChannelSession(channel); }
  handleSelfChannelDeparture(channel: string) { this.channelPort.handleSelfChannelDeparture(channel); }
  setChannelSession(channel: string, phase: ChannelSessionPhase, options: { sourceTarget?: string; visiblePending?: boolean; previouslyJoined?: boolean } = {}) {
    return this.channelPort.setChannelSession(channel, phase, options);
  }
  clearChannelSessions() { this.channelPort.clearChannelSessions(); }
}
