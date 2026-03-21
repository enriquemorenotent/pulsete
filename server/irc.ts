import { randomUUID } from 'node:crypto';
import type { MessageInput } from './storage.js';
import { connectSocket } from './irc-connect.js';
import {
  emitChannelListFailed,
  emitFriendPresence,
  emitMessage,
  emitPendingChannel,
  emitPendingChannelRemoved,
  emitState,
  emitStatus,
} from './irc-emit.js';
import { handleIrcLine } from './irc-handle-line.js';
import { findIrcCaseMatch, isSameIrcIdentifier } from './irc-parser.js';
import { normalizeIrcIdentifier } from '../shared/irc-identifiers.js';
import { removeChannelUser, upsertChannelUser } from '../shared/channel-users.js';
import type { ChannelListEntry, ChannelUserState } from '../shared/protocol.js';
import {
  createFriendPresenceReplyContext,
  createChannelReplyContext,
  createMessageReplyContext,
  createNickReplyContext,
  createReplyContextFromRaw,
  type PendingReplyContext,
} from './irc-reply-context.js';
import { ReplyTracker } from './irc-reply-tracker.js';
import type { ChannelSessionPhase, ChannelSessionState, Handlers, IrcConnectionState, IrcSocket } from './irc-types.js';
import { formatServerNumeric } from './irc-server-log.js';
import type { RuntimeNetworkProfile } from './storage-types.js';
import { maxBufferedIrcBytes, maxIrcCommandBytes, maxIsonNickBytes } from './irc-limits.js';

const friendPresencePollMs = 60_000;
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
  private friendNicks: string[] = [];
  private onlineFriendKeys = new Set<string>();
  private friendPresenceTimer: ReturnType<typeof setInterval> | null = null;
  private pendingFriendPresencePoll: { id: number; remainingResponses: number; onlineNicks: string[] } | null = null;
  private nextFriendPresencePollId = 0;
  private friendPresenceEnabled = true;
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
  private readonly channelJoinTimeoutMs: number;
  private channelListTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
  private drainingChannelListExpiresAt: number | null = null;
  private readonly channelListTimeoutMs: number;
  private readonly channelListDrainGraceMs: number;
  private readonly replyTracker = new ReplyTracker();

  constructor(
    profile: RuntimeNetworkProfile,
    readonly handlers: Handlers,
    options: IrcConnectionOptions = {}
  ) {
    this.profile = profile;
    this.currentNick = profile.nick;
    this.channelJoinTimeoutMs = options.channelJoinTimeoutMs ?? defaultChannelJoinTimeoutMs;
    this.channelListTimeoutMs = options.channelListTimeoutMs ?? defaultChannelListTimeoutMs;
    this.channelListDrainGraceMs = options.channelListDrainGraceMs ?? defaultChannelListDrainGraceMs;
  }

  get state() {
    return {
      phase: this.connected ? 'connected' as const : this.socket ? 'connecting' as const : 'offline' as const,
      serverName: this.serverName,
      nick: this.currentNick,
    };
  }

  get pendingNick() {
    return this.replyTracker.pendingNick;
  }

  set pendingNick(value: string | null) {
    this.replyTracker.setPendingNick(value);
  }

  get pendingReplyContexts(): readonly PendingReplyContext[] {
    return this.replyTracker.pendingReplyContexts;
  }

  openSocket(socket: IrcSocket) {
    if (this.socket === socket) {
      return;
    }
    this.clearReconnectTimer();
    this.manualDisconnect = false;
    this.lastFailureMessage = null;
    this.socket = socket;
    emitState(this);
  }

  beginLogin() {
    this.lastFailureMessage = null;
  }

  setConnectDeadlineTimer(timer: ReturnType<typeof setTimeout>) {
    this.clearConnectDeadlineTimer();
    this.connectDeadlineTimer = timer;
  }

  markConnectionFailure(detail: string) {
    this.lastFailureMessage = this.formatConnectionFailure(detail);
    emitStatus(this, this.lastFailureMessage, 'error');
  }

  handleSocketClosed(socket: IrcSocket) {
    if (this.socket !== socket) {
      return;
    }
    this.clearConnectDeadlineTimer();
    this.clearReconnectTimer();
    const wasConnected = this.connected;
    const failureMessage = this.lastFailureMessage;
    this.socket = null;
    this.resetTransientState();
    this.connected = false;
    this.serverName = null;
    this.currentNick = this.profile.nick;
    this.lastFailureMessage = null;
    emitState(this);
    if (wasConnected) {
      emitStatus(this, 'Disconnected from server');
    } else if (!failureMessage) {
      emitStatus(this, this.formatConnectionFailure('Connection closed'), 'error');
    }
    this.scheduleReconnect();
  }

  markRegistered(serverName: string | null, nick: string | null) {
    this.connected = true;
    this.clearConnectDeadlineTimer();
    this.serverName = serverName ?? this.profile.host;
    this.reconnectAttempts = 0;
    this.currentNick = nick ?? this.profile.nick;
    this.discardPendingNickReplyContexts();
    emitState(this);
  }

  clearPendingNick() {
    this.replyTracker.clearPendingNick();
  }

  applyNickFallback(
    fallbackNick: string,
    options: { replyTarget?: string; updatePending: boolean }
  ) {
    if (options.updatePending) {
      this.pendingNick = fallbackNick;
    } else {
      this.currentNick = fallbackNick;
    }
    if (options.replyTarget) {
      this.queueReplyContext(createNickReplyContext(options.replyTarget, fallbackNick));
    }
  }

  confirmNick(newNick: string) {
    this.consumePendingNickReplyContexts(newNick);
    this.currentNick = newNick;
    emitState(this);
  }

  connect(resetRetryBudget = true) {
    this.clearReconnectTimer();
    if (resetRetryBudget) {
      this.reconnectAttempts = 0;
    }
    this.friendPresenceEnabled = true;
    this.lastFailureMessage = null;
    connectSocket(this);
  }

  disconnect(raw = 'QUIT :Client disconnecting') {
    this.manualDisconnect = true;
    this.reconnectAttempts = 0;
    this.clearConnectDeadlineTimer();
    this.clearReconnectTimer();
    const socket = this.socket;
    if (socket) {
      this.sendRaw(raw);
      socket.end();
      this.socket = null;
    }
    const wasActive = this.connected || socket !== null || this.serverName !== null;
    this.resetTransientState();
    this.connected = false;
    this.serverName = null;
    this.currentNick = this.profile.nick;
    this.lastFailureMessage = null;
    if (wasActive) {
      emitState(this);
      emitStatus(this, 'Disconnected from server');
    }
  }

  join(
    channel: string,
    sourceTarget = 'server',
    options: { visiblePending?: boolean } | string = {}
  ) {
    if (!this.connected) {
      emitStatus(this, this.socket ? 'Still connecting to server' : 'Not connected', 'error', sourceTarget);
      return false;
    }
    if (!this.sendRaw(`JOIN ${channel}`, sourceTarget)) {
      return false;
    }
    const visiblePending = typeof options === 'string' ? false : options.visiblePending ?? false;
    this.setChannelSession(channel, 'joining', {
      sourceTarget,
      visiblePending,
    });
    return true;
  }

  part(channel: string, reason = 'Leaving', sourceTarget = channel) {
    if (this.getChannelSession(channel)?.phase === 'joined') {
      this.setChannelSession(channel, 'leaving', { sourceTarget, visiblePending: false });
    }
    return this.sendTrackedRaw(`PART ${channel} :${reason}`, sourceTarget, createChannelReplyContext(sourceTarget, channel, 'part'));
  }

  say(target: string, text: string, sourceTarget = target) {
    if (this.sendTrackedRaw(`PRIVMSG ${target} :${text}`, sourceTarget, createMessageReplyContext(sourceTarget, target))) {
      emitMessage(this, this.createSelfMessage(target, text));
    }
  }

  action(target: string, text: string, sourceTarget = target) {
    if (
      this.sendTrackedRaw(
        `PRIVMSG ${target} :\u0001ACTION ${text}\u0001`,
        sourceTarget,
        createMessageReplyContext(sourceTarget, target)
      )
    ) {
      emitMessage(this, this.createSelfMessage(target, `* ${this.currentNick} ${text}`));
    }
  }

  setNick(nick: string, sourceTarget = 'server') {
    if (!this.connected) {
      emitStatus(this, this.socket ? 'Still connecting to server' : 'Not connected', 'error', sourceTarget);
      return false;
    }
    return this.sendTrackedRaw(`NICK ${nick}`, sourceTarget, createNickReplyContext(sourceTarget, nick));
  }

  updateProfile(profile: RuntimeNetworkProfile) {
    const reconnectPending = !this.connected && this.socket !== null;
    const restartConnectingSocket = reconnectPending && requiresConnectingReconnect(this.profile, profile);
    const reconnectActiveSession = this.connected && requiresSessionReconnect(this.profile, profile);
    const applyNickUpdate = this.connected
      && !reconnectActiveSession
      && !isSameIrcIdentifier(this.pendingNick ?? this.currentNick, profile.nick);
    if (restartConnectingSocket) {
      const socket = this.socket;
      this.socket = null;
      this.resetTransientState();
      socket?.destroy();
    }
    this.profile = profile;
    if (!this.connected) {
      this.currentNick = profile.nick;
    }
    if (restartConnectingSocket) {
      connectSocket(this);
      return;
    }
    if (reconnectActiveSession) {
      this.reconnectWithUpdatedProfile();
      return;
    }
    if (applyNickUpdate) {
      this.setNick(profile.nick);
    }
  }

  clearReconnectTimer() {
    if (!this.reconnectTimer) {
      return;
    }
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  clearConnectDeadlineTimer() {
    if (!this.connectDeadlineTimer) {
      return;
    }
    clearTimeout(this.connectDeadlineTimer);
    this.connectDeadlineTimer = null;
  }

  setFriendNicks(nicks: string[]) {
    this.friendNicks = dedupeFriendNicks(nicks);
    const currentOnline = this.friendNicks.filter((nick) => this.onlineFriendKeys.has(normalizeIrcIdentifier(nick)));
    this.updateOnlineFriendKeys(currentOnline);
    if (!this.connected || !this.socket || !this.friendPresenceEnabled || this.friendNicks.length === 0) {
      this.pendingFriendPresencePoll = null;
      this.clearFriendPresenceTimer();
      return;
    }
    this.ensureFriendPresenceTimer();
    this.pollFriendPresence();
  }

  refreshFriendPresence() {
    if (!this.connected || !this.socket || !this.friendPresenceEnabled || this.friendNicks.length === 0) {
      this.pendingFriendPresencePoll = null;
      this.updateOnlineFriendKeys([]);
      this.clearFriendPresenceTimer();
      return;
    }
    this.ensureFriendPresenceTimer();
    this.pollFriendPresence();
  }

  handleFriendPresence(pollId: number, onlineNicks: string[]) {
    const pendingPoll = this.pendingFriendPresencePoll;
    if (!pendingPoll || pendingPoll.id !== pollId) {
      return;
    }

    pendingPoll.onlineNicks = mergeUniqueNicks(pendingPoll.onlineNicks, onlineNicks);
    pendingPoll.remainingResponses -= 1;
    if (pendingPoll.remainingResponses > 0) {
      return;
    }

    this.pendingFriendPresencePoll = null;
    this.updateOnlineFriendKeys(pendingPoll.onlineNicks);
  }

  disableFriendPresence() {
    this.friendPresenceEnabled = false;
    this.pendingFriendPresencePoll = null;
    this.clearFriendPresenceTimer();
    this.updateOnlineFriendKeys([]);
  }

  resetTransientState() {
    this.buffer = '';
    this.clearChannelSessions();
    this.abortActiveChannelList('Channel list request was interrupted');
    this.clearDrainingChannelList();
    this.replyTracker.reset();
    this.pendingFriendPresencePoll = null;
    this.clearConnectDeadlineTimer();
    this.clearFriendPresenceTimer();
    this.updateOnlineFriendKeys([]);
  }

  queueReplyContext(context: PendingReplyContext) {
    this.replyTracker.queue(context);
  }

  consumeReplyTarget(command: string, params: string[], nick: string | null, rawTarget?: string) {
    this.prunePendingReplyContexts();
    return this.replyTracker.consumeReplyTarget(command, params, nick, rawTarget);
  }

  consumeReplyContext(command: string, params: string[], nick: string | null, rawTarget?: string) {
    this.prunePendingReplyContexts();
    return this.replyTracker.consumeReplyContext(command, params, nick, rawTarget);
  }

  sendRaw(raw: string, statusTarget?: string) {
    if (!this.socket) {
      emitStatus(this, 'Not connected', 'error', statusTarget);
      return false;
    }
    if (Buffer.byteLength(raw, 'utf8') > maxIrcCommandBytes) {
      emitStatus(this, `IRC command exceeds the ${maxIrcCommandBytes}-byte limit`, 'error', statusTarget);
      return false;
    }
    try {
      this.socket.write(`${raw}\r\n`);
    } catch {
      this.lastFailureMessage = 'Connection is no longer writable';
      emitStatus(this, this.lastFailureMessage, 'error', statusTarget);
      this.socket.destroy();
      return false;
    }
    return true;
  }

  sendClientRaw(raw: string, sourceTarget = 'server') {
    this.prunePendingReplyContexts();
    const trimmed = raw.trim();
    const [commandToken = '', ...rest] = trimmed.split(/\s+/);
    const command = commandToken.toUpperCase();
    if (command === 'JOIN' && rest[0]) {
      return this.join(rest[0], sourceTarget, { visiblePending: true });
    }
    if (command === 'PART' && rest[0]) {
      const reason = rest.slice(1).join(' ').replace(/^:/, '') || 'Leaving';
      return this.part(rest[0], reason, sourceTarget);
    }
    const replyContext = createReplyContextFromRaw(sourceTarget, raw);
    if (command === 'LIST') {
      if (this.isChannelListPending()) {
        emitStatus(this, this.getChannelListRequestFailureMessage(), 'error', sourceTarget);
        return false;
      }
      if (!this.connected) {
        emitStatus(this, this.socket ? 'Still connecting to server' : 'Not connected', 'error', sourceTarget);
        return false;
      }
      if (!this.sendRaw(raw, sourceTarget)) {
        return false;
      }
      this.startChannelList('raw', { sourceTarget });
      return true;
    }
    return this.sendTrackedRaw(raw, sourceTarget, replyContext);
  }

  requestChannelList(requestId: string) {
    this.prunePendingReplyContexts();
    if (!this.connected || this.isChannelListPending()) {
      return false;
    }
    if (!this.sendRaw('LIST', 'server')) {
      return false;
    }
    this.startChannelList('structured', { requestId });
    return true;
  }

  recordChannelListEntry(requestId: string, entry: ChannelListEntry) {
    if (requestId !== this.activeChannelListRequestId) {
      return;
    }
    this.activeChannelListEntries.push(entry);
    this.resetChannelListTimeout(requestId);
  }

  finishChannelListRequest(requestId: string) {
    if (requestId === this.activeChannelListRequestId && this.activeChannelListMode === 'structured') {
      this.clearActiveChannelList();
    }
    if (requestId === this.drainingChannelListRequestId && this.drainingChannelListMode === 'structured') {
      this.clearDrainingChannelList();
    }
  }

  getChannelListRequestFailureMessage() {
    this.prunePendingReplyContexts();
    if (this.isChannelListPending()) {
      return 'Waiting for the previous channel list response to finish';
    }
    return this.socket ? 'Still connecting to server' : 'Not connected';
  }

  getActiveChannelListSnapshot() {
    if (this.activeChannelListMode !== 'structured' || !this.activeChannelListRequestId) {
      return null;
    }
    return {
      requestId: this.activeChannelListRequestId,
      entries: [...this.activeChannelListEntries],
    };
  }

  consume(chunk: string) {
    this.buffer += chunk;
    let newlineIndex = this.buffer.indexOf('\n');
    while (newlineIndex !== -1) {
      const line = this.buffer.slice(0, newlineIndex).replace(/\r$/, '');
      this.buffer = this.buffer.slice(newlineIndex + 1);
      if (Buffer.byteLength(line, 'utf8') > maxBufferedIrcBytes) {
        this.handleOversizedServerLine();
        return;
      }
      if (line.length > 0) {
        handleIrcLine(this, line);
      }
      newlineIndex = this.buffer.indexOf('\n');
    }
    if (Buffer.byteLength(this.buffer, 'utf8') > maxBufferedIrcBytes) {
      this.handleOversizedServerLine();
    }
  }

  private handleOversizedServerLine() {
    this.buffer = '';
    this.lastFailureMessage = 'Server sent an oversized IRC line';
    emitStatus(this, this.lastFailureMessage, 'error');
    this.socket?.destroy();
  }

  private resetChannelListTimeout(requestId: string) {
    if (this.channelListTimeoutMs <= 0) {
      return;
    }
    if (this.channelListTimeoutTimer) {
      clearTimeout(this.channelListTimeoutTimer);
    }
    const timer = setTimeout(() => {
      if (!this.activeChannelListMode) {
        return;
      }
      if (this.activeChannelListMode === 'structured' && this.activeChannelListRequestId !== requestId) {
        return;
      }
      if (this.activeChannelListMode === 'raw' && requestId !== '__raw__') {
        return;
      }
      this.failActiveChannelList('Channel list request timed out');
    }, this.channelListTimeoutMs);
    timer.unref?.();
    this.channelListTimeoutTimer = timer;
  }

  handleChannelListNumeric(command: string, params: string[]) {
    this.prunePendingReplyContexts();
    if (!isChannelListNumeric(command, params)) {
      return false;
    }
    const mode = this.activeChannelListMode ?? this.drainingChannelListMode;
    if (!mode) {
      return true;
    }
    const isDraining = this.activeChannelListMode === null;
    if (mode === 'structured') {
      const requestId = (isDraining ? this.drainingChannelListRequestId : this.activeChannelListRequestId) ?? null;
      if (!requestId) {
        return false;
      }
      if (command === '321') {
        return true;
      }
      if (command === '322') {
        const entry = parseChannelListEntry(params);
        if (entry && !isDraining) {
          this.recordChannelListEntry(requestId, entry);
          this.handlers.onEvent({
            type: 'channel-list-entry',
            networkId: this.profile.id,
            requestId,
            entry,
          });
        }
        return true;
      }
      if (command === '323') {
        if (isDraining) {
          this.clearDrainingChannelList();
          return true;
        }
        this.clearActiveChannelList();
        this.handlers.onEvent({
          type: 'channel-list-completed',
          networkId: this.profile.id,
          requestId,
        });
        return true;
      }
      if (!isChannelListFailureNumeric(command, params)) {
        return false;
      }
      if (isDraining) {
        this.clearDrainingChannelList();
      } else {
        this.failActiveChannelList(formatChannelListFailure(command, params));
      }
      return true;
    }

    const sourceTarget = (isDraining ? this.drainingChannelListSourceTarget : this.activeChannelListSourceTarget) ?? 'server';
    if (isDraining) {
      if (command === '323' || isChannelListFailureNumeric(command, params)) {
        this.clearDrainingChannelList();
      }
      return true;
    }
    for (const line of formatChannelListReply(command, params)) {
      emitStatus(this, line, 'system', sourceTarget);
    }
    if (command === '323') {
      this.clearActiveChannelList();
      return true;
    }
    if (isChannelListFailureNumeric(command, params)) {
      this.failActiveChannelList(formatChannelListFailure(command, params), {
        emitStructuredFailure: false,
        sourceTarget,
      });
      return true;
    }
    this.resetChannelListTimeout('__raw__');
    return true;
  }

  private clearActiveChannelList() {
    if (this.channelListTimeoutTimer) {
      clearTimeout(this.channelListTimeoutTimer);
      this.channelListTimeoutTimer = null;
    }
    this.activeChannelListMode = null;
    this.activeChannelListSourceTarget = null;
    this.activeChannelListRequestId = null;
    this.activeChannelListEntries = [];
  }

  private abortActiveChannelList(message: string) {
    if (!this.activeChannelListMode) {
      return;
    }
    this.failActiveChannelList(message);
  }

  updateChannelUsers(channel: string, nick: string | null, joined: boolean) {
    const channelKey = this.resolveTrackedChannelKey(channel) ?? channel;
    const current = this.channelUsers.get(channelKey) ?? createEmptyChannelUsers();
    const nextUsers =
      !nick ? current : joined ? upsertChannelUser(current, { nick, mode: 'normal' }) : removeChannelUser(current, nick);
    this.channelUsers.set(channelKey, nextUsers);
    return nextUsers;
  }

  getTrackedChannelUsers(channel: string) {
    const key = this.resolveTrackedChannel(channel);
    return key ? this.channelUsers.get(key) ?? createEmptyChannelUsers() : createEmptyChannelUsers();
  }

  setTrackedChannelUsers(channel: string, users: ChannelUserState[]) {
    const key = this.resolveTrackedChannelKey(channel) ?? channel;
    this.channelUsers.set(key, users);
    return users;
  }

  getTrackedChannelUserEntries() {
    return Array.from(this.channelUsers.entries(), ([channel, users]) => [channel, users] as [string, ChannelUserState[]]);
  }

  resolveTrackedChannel(channel: string) {
    return this.resolveTrackedChannelKey(channel, false);
  }

  clearExpiredChannelSessions() {
    this.prunePendingReplyContexts();
  }

  getChannelSession(channel: string) {
    const key = this.resolveTrackedChannelKey(channel, false);
    return key ? this.channelSessions.get(key) ?? null : null;
  }

  listPendingChannels() {
    return Array.from(this.channelSessions.values())
      .filter((session) => session.phase === 'joining' && session.visiblePending)
      .map((session) => ({ networkId: this.profile.id, channel: session.channel }));
  }

  trackChannel(channel: string) {
    return this.setChannelSession(channel, 'joined', { visiblePending: false }).channel;
  }

  untrackChannel(channel: string) {
    this.removeChannelSession(channel);
  }

  removeChannelSession(channel: string) {
    const key = this.resolveTrackedChannelKey(channel, false);
    if (!key) {
      return null;
    }
    const session = this.channelSessions.get(key) ?? null;
    this.channelUsers.delete(key);
    if (!session) {
      return null;
    }
    this.clearChannelJoinTimer(session);
    this.channelSessions.delete(key);
    this.hidePendingChannel(session);
    return { ...session, joinTimeoutTimer: null };
  }

  handleSelfChannelDeparture(channel: string) {
    const session = this.getChannelSession(channel);
    if (session?.phase === 'joining') {
      this.setTrackedChannelUsers(channel, []);
      this.setChannelSession(channel, 'joining', {
        sourceTarget: session.sourceTarget,
        visiblePending: session.visiblePending,
        previouslyJoined: false,
      });
      return;
    }
    this.removeChannelSession(channel);
  }

  setChannelSession(
    channel: string,
    phase: ChannelSessionPhase,
    options: { sourceTarget?: string; visiblePending?: boolean; previouslyJoined?: boolean } = {}
  ) {
    const key = this.resolveTrackedChannelKey(channel) ?? channel;
    const current = this.channelSessions.get(key) ?? null;
    const existingUsers = this.channelUsers.get(key) ?? [];
    if (current) {
      this.clearChannelJoinTimer(current);
    }
    const next: ChannelSessionState = {
      channel: current?.channel ?? channel,
      phase,
      sourceTarget: options.sourceTarget ?? current?.sourceTarget ?? 'server',
      visiblePending: options.visiblePending ?? current?.visiblePending ?? false,
      previouslyJoined: options.previouslyJoined ?? current?.previouslyJoined ?? false,
      joinTimeoutTimer: null,
    };
    if (phase === 'joining') {
      next.previouslyJoined = options.previouslyJoined ?? (
        current?.phase === 'joined'
        || current?.previouslyJoined === true
        || existingUsers.length > 0
      );
      next.joinTimeoutTimer = this.createChannelJoinTimer(next.channel);
    } else {
      next.visiblePending = false;
      next.previouslyJoined = false;
    }
    this.channelSessions.set(key, next);
    if (!current?.visiblePending && next.visiblePending) {
      emitPendingChannel(this, next.channel);
    }
    if (current?.visiblePending && !next.visiblePending) {
      emitPendingChannelRemoved(this, next.channel);
    }
    return next;
  }

  private startChannelList(
    mode: 'raw' | 'structured',
    options: { requestId?: string; sourceTarget?: string }
  ) {
    this.clearActiveChannelList();
    this.activeChannelListMode = mode;
    this.activeChannelListSourceTarget = mode === 'raw' ? options.sourceTarget ?? 'server' : null;
    this.activeChannelListRequestId = mode === 'structured' ? options.requestId ?? null : null;
    this.activeChannelListEntries = [];
    this.resetChannelListTimeout(this.activeChannelListRequestId ?? '__raw__');
  }

  private failActiveChannelList(
    message: string,
    options: { emitStructuredFailure?: boolean; sourceTarget?: string } = {}
  ) {
    const mode = this.activeChannelListMode;
    const requestId = this.activeChannelListRequestId;
    const sourceTarget = options.sourceTarget ?? this.activeChannelListSourceTarget ?? 'server';
    if (!mode) {
      return;
    }
    this.markDrainingChannelList(mode, requestId, sourceTarget);
    if (mode === 'structured') {
      if (requestId && options.emitStructuredFailure !== false) {
        emitChannelListFailed(this, requestId, message);
      }
      return;
    }
    emitStatus(this, message, 'error', sourceTarget);
  }

  private clearDrainingChannelList() {
    this.drainingChannelListMode = null;
    this.drainingChannelListSourceTarget = null;
    this.drainingChannelListRequestId = null;
    this.drainingChannelListExpiresAt = null;
  }

  private markDrainingChannelList(mode: 'raw' | 'structured', requestId: string | null, sourceTarget: string) {
    this.clearActiveChannelList();
    this.drainingChannelListMode = mode;
    this.drainingChannelListSourceTarget = mode === 'raw' ? sourceTarget : null;
    this.drainingChannelListRequestId = mode === 'structured' ? requestId : null;
    this.drainingChannelListExpiresAt = Date.now() + this.channelListDrainGraceMs;
  }

  private clearChannelSessions() {
    for (const session of this.channelSessions.values()) {
      this.clearChannelJoinTimer(session);
      this.hidePendingChannel(session);
    }
    this.channelSessions.clear();
    this.channelUsers.clear();
  }

  private hidePendingChannel(session: ChannelSessionState) {
    if (session.visiblePending) {
      emitPendingChannelRemoved(this, session.channel);
    }
  }

  private clearChannelJoinTimer(session: ChannelSessionState) {
    if (!session.joinTimeoutTimer) {
      return;
    }
    clearTimeout(session.joinTimeoutTimer);
    session.joinTimeoutTimer = null;
  }

  private createChannelJoinTimer(channel: string) {
    if (this.channelJoinTimeoutMs <= 0) {
      return null;
    }
    const timer = setTimeout(() => this.handleChannelJoinTimeout(channel), this.channelJoinTimeoutMs);
    timer.unref?.();
    return timer;
  }

  private handleChannelJoinTimeout(channel: string) {
    const session = this.getChannelSession(channel);
    if (!session || session.phase !== 'joining') {
      return;
    }
    const sourceTarget = session.sourceTarget;
    if (session.previouslyJoined) {
      this.setChannelSession(channel, 'joined', { sourceTarget });
    } else {
      this.removeChannelSession(channel);
    }
    emitStatus(this, `Timed out joining ${channel}`, 'error', sourceTarget);
  }

  discardPendingChannelReplyContexts(
    channel: string,
    predicate?: (context: Extract<PendingReplyContext, { kind: 'channel' }>) => boolean
  ) {
    return this.replyTracker.discardPendingChannelReplyContexts(channel, predicate);
  }

  consumePendingNickReplyContexts(requestedNick: string) {
    return this.replyTracker.consumePendingNickReplyContexts(requestedNick);
  }

  discardPendingNickReplyContexts() {
    return this.replyTracker.discardPendingNickReplyContexts();
  }

  private resolveTrackedChannelKey(channel: string, createIfMissing = true) {
    return findIrcCaseMatch(this.channelSessions.keys(), channel)
      ?? findIrcCaseMatch(this.channelUsers.keys(), channel)
      ?? (createIfMissing ? channel : null);
  }

  private reconnectWithUpdatedProfile() {
    const socket = this.socket;
    this.clearReconnectTimer();
    this.reconnectAttempts = 0;
    this.socket = null;
    this.resetTransientState();
    this.connected = false;
    this.serverName = null;
    this.currentNick = this.profile.nick;
    this.pendingNick = null;
    this.lastFailureMessage = null;
    emitState(this);
    emitStatus(this, 'Reconnecting to apply updated network settings', 'notice');
    try {
      socket?.write('QUIT :Reconnecting with updated settings\r\n');
    } catch {
      // Ignore write failures while replacing the socket.
    }
    socket?.end();
    connectSocket(this);
  }

  private createSelfMessage(target: string, body: string): MessageInput {
    return {
      id: randomUUID(),
      networkId: this.profile.id,
      target,
      nick: this.currentNick,
      body,
      kind: 'line',
      self: true,
      ts: Date.now(),
    };
  }

  private sendTrackedRaw(raw: string, sourceTarget: string, replyContext: PendingReplyContext | null) {
    if (!this.connected) {
      emitStatus(this, this.socket ? 'Still connecting to server' : 'Not connected', 'error', sourceTarget);
      return false;
    }
    if (!this.sendRaw(raw, sourceTarget)) {
      return false;
    }
    if (replyContext) {
      this.queueReplyContext(replyContext);
    }
    return true;
  }

  private ensureFriendPresenceTimer() {
    if (this.friendPresenceTimer) {
      return;
    }
    const timer = setInterval(() => this.pollFriendPresence(), friendPresencePollMs);
    timer.unref?.();
    this.friendPresenceTimer = timer;
  }

  private clearFriendPresenceTimer() {
    if (!this.friendPresenceTimer) {
      return;
    }
    clearInterval(this.friendPresenceTimer);
    this.friendPresenceTimer = null;
  }

  private pollFriendPresence() {
    if (!this.connected || !this.socket || !this.friendPresenceEnabled || this.friendNicks.length === 0) {
      return;
    }
    const batches = splitIsonNickBatches(this.friendNicks);
    if (batches.length === 0) {
      this.pendingFriendPresencePoll = null;
      this.updateOnlineFriendKeys([]);
      return;
    }
    const pollId = ++this.nextFriendPresencePollId;
    this.pendingFriendPresencePoll = {
      id: pollId,
      remainingResponses: batches.length,
      onlineNicks: [],
    };
    let sentBatches = 0;
    for (const batch of batches) {
      if (this.sendRaw(`ISON ${batch.join(' ')}`)) {
        this.queueReplyContext(createFriendPresenceReplyContext(pollId));
        sentBatches += 1;
      }
    }
    if (sentBatches === 0) {
      this.pendingFriendPresencePoll = null;
      this.updateOnlineFriendKeys([]);
      return;
    }
    this.pendingFriendPresencePoll.remainingResponses = sentBatches;
  }

  private scheduleReconnect() {
    if (this.manualDisconnect || this.reconnectAttempts >= 3) {
      return;
    }
    const attempt = ++this.reconnectAttempts;
    const timer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.socket || this.manualDisconnect || attempt !== this.reconnectAttempts) {
        return;
      }
      emitStatus(this, `Reconnecting (${attempt}/3)`, 'notice');
      this.connect(false);
    }, 3000 * attempt);
    timer.unref?.();
    this.reconnectTimer = timer;
  }

  private formatConnectionFailure(detail: string) {
    return `Unable to connect to ${this.profile.host}:${this.profile.port} (${detail})`;
  }

  private updateOnlineFriendKeys(onlineNicks: string[]) {
    const nextKeys = new Set(onlineNicks.map(normalizeIrcIdentifier));
    if (setsEqual(this.onlineFriendKeys, nextKeys)) {
      return;
    }
    this.onlineFriendKeys = nextKeys;
    emitFriendPresence(this, onlineNicks);
  }

  private isChannelListPending() {
    this.prunePendingReplyContexts();
    return this.activeChannelListMode !== null || this.drainingChannelListMode !== null;
  }

  private prunePendingReplyContexts() {
    const now = Date.now();
    this.replyTracker.prune();
    if (
      this.drainingChannelListMode
      && this.drainingChannelListExpiresAt !== null
      && this.drainingChannelListExpiresAt < now
    ) {
      this.clearDrainingChannelList();
    }
  }
}

const channelListNumerics = new Set(['321', '322', '323', '263', '421', '461']);

const isChannelListNumeric = (command: string, params: string[]) =>
  command === '321'
  || command === '322'
  || command === '323'
  || isChannelListFailureNumeric(command, params);

const isChannelListFailureNumeric = (command: string, params: string[]) =>
  command === '263'
  || ((command === '421' || command === '461') && (params[1] ?? '').toUpperCase() === 'LIST');

const parseChannelListEntry = (params: string[]) => {
  const name = params[1] ?? '';
  if (!name) {
    return null;
  }
  const parsedUsers = Number.parseInt(params[2] ?? '0', 10);
  return {
    name,
    users: Number.isFinite(parsedUsers) && parsedUsers >= 0 ? parsedUsers : 0,
    topic: params[3] ?? '',
  };
};

const formatChannelListFailure = (command: string, params: string[]) =>
  formatServerNumeric(command, params).at(0)?.replace(/^\* /, '') ?? 'Failed to load the channel list';

const formatChannelListReply = (command: string, params: string[]) =>
  channelListNumerics.has(command) ? formatServerNumeric(command, params) : [];

const createEmptyChannelUsers = (): ChannelUserState[] => [];

const dedupeFriendNicks = (nicks: string[]) => {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const nick of nicks) {
    const normalized = normalizeIrcIdentifier(nick);
    if (seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    unique.push(nick);
  }
  return unique;
};

const mergeUniqueNicks = (current: string[], next: string[]) => {
  const seen = new Set(current.map(normalizeIrcIdentifier));
  const merged = [...current];
  for (const nick of next) {
    const normalized = normalizeIrcIdentifier(nick);
    if (seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    merged.push(nick);
  }
  return merged;
};

const splitIsonNickBatches = (nicks: string[]) => {
  const batches: string[][] = [];
  let batch: string[] = [];
  let batchBytes = Buffer.byteLength('ISON ', 'utf8');
  for (const nick of nicks) {
    const separatorBytes = batch.length === 0 ? 0 : 1;
    const nickBytes = Buffer.byteLength(nick, 'utf8');
    if (nickBytes > maxIsonNickBytes) {
      continue;
    }
    if (batch.length > 0 && batchBytes + separatorBytes + nickBytes > maxIrcCommandBytes) {
      batches.push(batch);
      batch = [nick];
      batchBytes = Buffer.byteLength('ISON ', 'utf8') + nickBytes;
      continue;
    }
    batch.push(nick);
    batchBytes += separatorBytes + nickBytes;
  }
  if (batch.length > 0) {
    batches.push(batch);
  }
  return batches;
};

const setsEqual = (left: Set<string>, right: Set<string>) =>
  left.size === right.size && Array.from(left).every((value) => right.has(value));

const requiresSocketRestart = (current: RuntimeNetworkProfile, next: RuntimeNetworkProfile) =>
  current.host !== next.host || current.port !== next.port || current.tls !== next.tls;

const requiresConnectingReconnect = (current: RuntimeNetworkProfile, next: RuntimeNetworkProfile) =>
  current.nick !== next.nick || requiresSessionReconnect(current, next);

const requiresSessionReconnect = (current: RuntimeNetworkProfile, next: RuntimeNetworkProfile) =>
  requiresSocketRestart(current, next)
  || current.password !== next.password
  || current.username !== next.username
  || getReportedRealName(current) !== getReportedRealName(next);

const getReportedRealName = (profile: RuntimeNetworkProfile) =>
  profile.realName || profile.name;
