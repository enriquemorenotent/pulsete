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
import type { ChannelSessionPhase, ChannelSessionState, Handlers, IrcConnectionState, IrcSocket } from './irc-types.js';
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
  socket: IrcSocket | null = null;
  buffer = '';
  readonly channelUsers = new Map<string, ChannelUserState[]>();
  readonly channelSessions = new Map<string, ChannelSessionState>();
  connectDeadlineTimer: ReturnType<typeof setTimeout> | null = null;
  friendNicks: string[] = [];
  onlineFriendKeys = new Set<string>();
  friendPresenceTimer: ReturnType<typeof setInterval> | null = null;
  pendingFriendPresencePoll: { id: number; remainingResponses: number; onlineNicks: string[] } | null = null;
  nextFriendPresencePollId = 0;
  friendPresenceEnabled = true;
  manualDisconnect = false;
  reconnectAttempts = 0;
  reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  connected = false;
  serverName: string | null = null;
  currentNick: string;
  activeChannelListMode: 'raw' | 'structured' | null = null;
  activeChannelListSourceTarget: string | null = null;
  activeChannelListRequestId: string | null = null;
  activeChannelListEntries: ChannelListEntry[] = [];
  drainingChannelListMode: 'raw' | 'structured' | null = null;
  drainingChannelListSourceTarget: string | null = null;
  drainingChannelListRequestId: string | null = null;
  lastFailureMessage: string | null = null;
  profile: RuntimeNetworkProfile;
  readonly channelJoinTimeoutMs: number;
  channelListTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
  drainingChannelListExpiresAt: number | null = null;
  readonly channelListTimeoutMs: number;
  readonly channelListDrainGraceMs: number;
  readonly replyTracker = new ReplyTracker();

  constructor(profile: RuntimeNetworkProfile, readonly handlers: Handlers, options: IrcConnectionOptions = {}) {
    this.profile = profile;
    this.currentNick = profile.nick;
    this.channelJoinTimeoutMs = options.channelJoinTimeoutMs ?? defaultChannelJoinTimeoutMs;
    this.channelListTimeoutMs = options.channelListTimeoutMs ?? defaultChannelListTimeoutMs;
    this.channelListDrainGraceMs = options.channelListDrainGraceMs ?? defaultChannelListDrainGraceMs;
  }

  get state() { return { phase: this.connected ? 'connected' as const : this.socket ? 'connecting' as const : 'offline' as const, serverName: this.serverName, nick: this.currentNick }; }
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
