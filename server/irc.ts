import { emitMessage, emitState, emitStatus } from './irc-emit.js';
import { clearActiveChannelList, abortActiveChannelList, clearDrainingChannelList, finishChannelListRequest, getActiveChannelListSnapshot, getChannelListRequestFailureMessage, handleChannelListNumeric, isChannelListPending, recordChannelListEntry, requestChannelList, startChannelList } from './irc-channel-list.js';
import { clearExpiredChannelSessions, clearChannelSessions, discardPendingChannelReplyContexts, getChannelSession, getTrackedChannelUserEntries, getTrackedChannelUsers, handleSelfChannelDeparture, listPendingChannels, removeChannelSession, resolveTrackedChannel, setChannelSession, setTrackedChannelUsers, trackChannel, untrackChannel, updateChannelUsers } from './irc-channel-state.js';
import { beginLogin, clearConnectDeadlineTimer, clearReconnectTimer, connect, disconnect, handleSocketClosed, markConnectionFailure, markRegistered, openSocket, resetTransientState, setConnectDeadlineTimer, updateProfile } from './irc-connection-lifecycle.js';
import { consume, createSelfMessage, sendClientRaw, sendRaw, sendTrackedRaw } from './irc-connection-io.js';
import { clearFriendPresenceTimer, disableFriendPresence, handleFriendPresence, refreshFriendPresence, setFriendNicks, updateOnlineFriendKeys } from './irc-friend-presence.js';
import { createChannelReplyContext, createMessageReplyContext, createNickReplyContext, type PendingReplyContext } from './irc-reply-context.js';
import { consumePendingNickReplyContexts, consumeReplyContext, consumeReplyTarget, discardPendingNickReplyContexts, prunePendingReplyContexts, queueReplyContext } from './irc-reply-state.js';
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
  }

  get state() { return { phase: this.connected ? 'connected' as const : this.socket ? 'connecting' as const : 'offline' as const, serverName: this.serverName, nick: this.currentNick }; }
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

  openSocket(socket: IrcSocket) { openSocket(this, socket); }
  beginLogin() { beginLogin(this); }
  setConnectDeadlineTimer(timer: ReturnType<typeof setTimeout>) { setConnectDeadlineTimer(this, timer); }
  markConnectionFailure(detail: string) { markConnectionFailure(this, detail); }
  handleSocketClosed(socket: IrcSocket) { handleSocketClosed(this, socket); }
  markRegistered(serverName: string | null, nick: string | null) { markRegistered(this, serverName, nick); }
  connect(resetRetryBudget = true) { connect(this, resetRetryBudget); }
  disconnect(raw = 'QUIT :Client disconnecting') { disconnect(this, raw); }
  updateProfile(profile: RuntimeNetworkProfile) { updateProfile(this, profile); }
  clearReconnectTimer() { clearReconnectTimer(this); }
  clearConnectDeadlineTimer() { clearConnectDeadlineTimer(this); }
  resetTransientState() { resetTransientState(this); }
  clearPendingNick() { this.replyTracker.clearPendingNick(); }
  applyNickFallback(fallbackNick: string, options: { replyTarget?: string; updatePending: boolean }) {
    options.updatePending ? (this.pendingNick = fallbackNick) : (this.currentNick = fallbackNick);
    if (options.replyTarget) this.queueReplyContext(createNickReplyContext(options.replyTarget, fallbackNick));
  }
  confirmNick(newNick: string) { this.consumePendingNickReplyContexts(newNick); this.currentNick = newNick; emitState(this); }

  join(channel: string, sourceTarget = 'server', options: { visiblePending?: boolean } | string = {}): boolean {
    if (!this.connected) return emitStatus(this, this.socket ? 'Still connecting to server' : 'Not connected', 'error', sourceTarget), false;
    if (!this.sendRaw(`JOIN ${channel}`, sourceTarget)) return false;
    const visiblePending = typeof options === 'string' ? false : options.visiblePending ?? false;
    this.setChannelSession(channel, 'joining', { sourceTarget, visiblePending });
    return true;
  }
  part(channel: string, reason = 'Leaving', sourceTarget = channel) {
    if (this.getChannelSession(channel)?.phase === 'joined') this.setChannelSession(channel, 'leaving', { sourceTarget, visiblePending: false });
    return sendTrackedRaw(this, `PART ${channel} :${reason}`, sourceTarget, createChannelReplyContext(sourceTarget, channel, 'part'));
  }
  say(target: string, text: string, sourceTarget = target) {
    if (sendTrackedRaw(this, `PRIVMSG ${target} :${text}`, sourceTarget, createMessageReplyContext(sourceTarget, target))) emitMessage(this, createSelfMessage(this, target, text));
  }
  action(target: string, text: string, sourceTarget = target) {
    if (sendTrackedRaw(this, `PRIVMSG ${target} :\u0001ACTION ${text}\u0001`, sourceTarget, createMessageReplyContext(sourceTarget, target))) emitMessage(this, createSelfMessage(this, target, `* ${this.currentNick} ${text}`));
  }
  setNick(nick: string, sourceTarget = 'server') {
    if (!this.connected) return emitStatus(this, this.socket ? 'Still connecting to server' : 'Not connected', 'error', sourceTarget), false;
    return sendTrackedRaw(this, `NICK ${nick}`, sourceTarget, createNickReplyContext(sourceTarget, nick));
  }

  setFriendNicks(nicks: string[]) { setFriendNicks(this, nicks); }
  refreshFriendPresence() { refreshFriendPresence(this); }
  handleFriendPresence(pollId: number, onlineNicks: string[]) { handleFriendPresence(this, pollId, onlineNicks); }
  disableFriendPresence() { disableFriendPresence(this); }
  clearFriendPresenceTimer() { clearFriendPresenceTimer(this); }
  updateOnlineFriendKeys(onlineNicks: string[]) { updateOnlineFriendKeys(this, onlineNicks); }

  queueReplyContext(context: PendingReplyContext) { queueReplyContext(this, context); }
  consumeReplyTarget(command: string, params: string[], nick: string | null, rawTarget?: string) { return consumeReplyTarget(this, command, params, nick, rawTarget); }
  consumeReplyContext(command: string, params: string[], nick: string | null, rawTarget?: string) { return consumeReplyContext(this, command, params, nick, rawTarget); }
  discardPendingChannelReplyContexts(channel: string, predicate?: (context: Extract<PendingReplyContext, { kind: 'channel' }>) => boolean) { return discardPendingChannelReplyContexts(this, channel, predicate); }
  consumePendingNickReplyContexts(requestedNick: string) { return consumePendingNickReplyContexts(this, requestedNick); }
  discardPendingNickReplyContexts() { return discardPendingNickReplyContexts(this); }
  prunePendingReplyContexts() { prunePendingReplyContexts(this); }

  sendRaw(raw: string, statusTarget?: string) { return sendRaw(this, raw, statusTarget); }
  sendClientRaw(raw: string, sourceTarget = 'server'): boolean { return sendClientRaw(this, raw, sourceTarget); }
  consume(chunk: string) { consume(this, chunk); }

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
  startChannelList(mode: 'raw' | 'structured', options: { requestId?: string; sourceTarget?: string }) { startChannelList(this, mode, options); }

  updateChannelUsers(channel: string, nick: string | null, joined: boolean) { return updateChannelUsers(this, channel, nick, joined); }
  getTrackedChannelUsers(channel: string) { return getTrackedChannelUsers(this, channel); }
  setTrackedChannelUsers(channel: string, users: ChannelUserState[]) { return setTrackedChannelUsers(this, channel, users); }
  getTrackedChannelUserEntries() { return getTrackedChannelUserEntries(this); }
  resolveTrackedChannel(channel: string) { return resolveTrackedChannel(this, channel); }
  clearExpiredChannelSessions() { clearExpiredChannelSessions(this); }
  getChannelSession(channel: string) { return getChannelSession(this, channel); }
  listPendingChannels() { return listPendingChannels(this); }
  trackChannel(channel: string) { return trackChannel(this, channel); }
  untrackChannel(channel: string) { untrackChannel(this, channel); }
  removeChannelSession(channel: string) { return removeChannelSession(this, channel); }
  handleSelfChannelDeparture(channel: string) { handleSelfChannelDeparture(this, channel); }
  setChannelSession(channel: string, phase: ChannelSessionPhase, options: { sourceTarget?: string; visiblePending?: boolean; previouslyJoined?: boolean } = {}) { return setChannelSession(this, channel, phase, options); }
  clearChannelSessions() { clearChannelSessions(this); }
}
