import { randomUUID } from 'node:crypto';
import type { MessageInput } from './storage.js';
import { connectSocket } from './irc-connect.js';
import { emitChannelListFailed, emitFriendPresence, emitMessage, emitState, emitStatus } from './irc-emit.js';
import { handleIrcLine } from './irc-handle-line.js';
import { findIrcCaseMatch, isSameIrcIdentifier } from './irc-parser.js';
import { normalizeIrcIdentifier } from '../shared/irc-identifiers.js';
import { removeChannelUser, upsertChannelUser } from '../shared/channel-users.js';
import type { ChannelListEntry, ChannelUserState } from '../shared/protocol.js';
import {
  consumeReplyTarget,
  consumeReplyContext,
  createChannelListReplyContext,
  createFriendPresenceReplyContext,
  createChannelReplyContext,
  createMessageReplyContext,
  getLatestPendingNick,
  createNickReplyContext,
  createReplyContextFromRaw,
  type PendingReplyContext,
} from './irc-reply-context.js';
import type { Handlers, IrcConnectionState, IrcSocket } from './irc-types.js';
import type { RuntimeNetworkProfile } from './storage-types.js';
import { maxBufferedIrcBytes, maxIrcCommandBytes, maxIsonNickBytes } from './irc-limits.js';

const friendPresencePollMs = 60_000;
const defaultChannelListTimeoutMs = 60_000;

type IrcConnectionOptions = {
  channelListTimeoutMs?: number;
};

export class IrcConnection implements IrcConnectionState {
  socket: IrcSocket | null = null;
  buffer = '';
  readonly channelUsers = new Map<string, ChannelUserState[]>();
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
  activeChannelListRequestId: string | null = null;
  activeChannelListEntries: ChannelListEntry[] = [];
  drainingChannelListRequestId: string | null = null;
  pendingNick: string | null = null;
  lastFailureMessage: string | null = null;
  pendingReplyContexts: PendingReplyContext[] = [];
  profile: RuntimeNetworkProfile;
  private channelListTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly channelListTimeoutMs: number;

  constructor(
    profile: RuntimeNetworkProfile,
    readonly handlers: Handlers,
    options: IrcConnectionOptions = {}
  ) {
    this.profile = profile;
    this.currentNick = profile.nick;
    this.channelListTimeoutMs = options.channelListTimeoutMs ?? defaultChannelListTimeoutMs;
  }

  get state() {
    return {
      connected: this.connected,
      serverName: this.serverName,
      nick: this.currentNick,
    };
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
    this.pendingNick = null;
    this.lastFailureMessage = null;
    if (wasActive) {
      emitState(this);
      emitStatus(this, 'Disconnected from server');
    }
  }

  join(channel: string, sourceTarget = 'server', failedJoinBufferId?: string) {
    return this.sendTrackedRaw(
      `JOIN ${channel}`,
      sourceTarget,
      createChannelReplyContext(sourceTarget, channel, 'join', { failedJoinBufferId })
    );
  }

  part(channel: string, reason = 'Leaving', sourceTarget = channel) {
    this.sendTrackedRaw(`PART ${channel} :${reason}`, sourceTarget, createChannelReplyContext(sourceTarget, channel, 'part'));
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
    this.channelUsers.clear();
    this.abortActiveChannelList('Channel list request was interrupted');
    this.drainingChannelListRequestId = null;
    this.pendingNick = null;
    this.pendingReplyContexts = [];
    this.pendingFriendPresencePoll = null;
    this.clearConnectDeadlineTimer();
    this.clearFriendPresenceTimer();
    this.updateOnlineFriendKeys([]);
  }

  queueReplyContext(context: PendingReplyContext) {
    this.pendingReplyContexts.push(context);
    if (context.kind === 'nick') {
      this.pendingNick = context.requestedNick;
    }
  }

  consumeReplyTarget(command: string, params: string[], nick: string | null, rawTarget?: string) {
    const target = consumeReplyTarget(this.pendingReplyContexts, command, params, nick, rawTarget);
    this.pendingNick = getLatestPendingNick(this.pendingReplyContexts);
    return target;
  }

  consumeReplyContext(command: string, params: string[], nick: string | null, rawTarget?: string) {
    const context = consumeReplyContext(this.pendingReplyContexts, command, params, nick, rawTarget);
    this.pendingNick = getLatestPendingNick(this.pendingReplyContexts);
    return context;
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
    const replyContext = createReplyContextFromRaw(sourceTarget, raw);
    if (replyContext?.kind === 'raw-list' && this.isChannelListPending()) {
      emitStatus(this, this.getChannelListRequestFailureMessage(), 'error', sourceTarget);
      return false;
    }
    return this.sendTrackedRaw(raw, sourceTarget, replyContext);
  }

  requestChannelList(requestId: string) {
    if (!this.connected || this.drainingChannelListRequestId || this.hasPendingRawChannelList()) {
      return false;
    }
    if (this.activeChannelListRequestId) {
      return false;
    }
    if (!this.sendTrackedRaw('LIST', 'server', createChannelListReplyContext(requestId))) {
      return false;
    }
    this.activeChannelListRequestId = requestId;
    this.activeChannelListEntries = [];
    this.resetChannelListTimeout(requestId);
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
    if (requestId === this.activeChannelListRequestId) {
      this.clearChannelListState();
    }
    if (requestId === this.drainingChannelListRequestId) {
      this.drainingChannelListRequestId = null;
    }
  }

  getChannelListRequestFailureMessage() {
    if (this.drainingChannelListRequestId || this.hasPendingRawChannelList() || this.activeChannelListRequestId) {
      return 'Waiting for the previous channel list response to finish';
    }
    return this.socket ? 'Still connecting to server' : 'Not connected';
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
      if (this.activeChannelListRequestId !== requestId) {
        return;
      }
      this.clearChannelListState();
      this.drainingChannelListRequestId = requestId;
      emitChannelListFailed(this, requestId, 'Channel list request timed out');
    }, this.channelListTimeoutMs);
    timer.unref?.();
    this.channelListTimeoutTimer = timer;
  }

  private clearChannelListState() {
    if (this.channelListTimeoutTimer) {
      clearTimeout(this.channelListTimeoutTimer);
      this.channelListTimeoutTimer = null;
    }
    this.activeChannelListRequestId = null;
    this.activeChannelListEntries = [];
  }

  private abortActiveChannelList(message: string) {
    const requestId = this.activeChannelListRequestId;
    if (!requestId) {
      return;
    }
    this.pendingReplyContexts = this.pendingReplyContexts.filter(
      (context) => context.kind !== 'channel-list' || context.requestId !== requestId
    );
    this.clearChannelListState();
    emitChannelListFailed(this, requestId, message);
  }

  updateChannelUsers(channel: string, nick: string | null, joined: boolean) {
    const channelKey = findIrcCaseMatch(this.channelUsers.keys(), channel) ?? channel;
    const current = this.channelUsers.get(channelKey) ?? createEmptyChannelUsers();
    const nextUsers =
      !nick ? current : joined ? upsertChannelUser(current, { nick, mode: 'normal' }) : removeChannelUser(current, nick);
    this.channelUsers.set(channelKey, nextUsers);
    return nextUsers;
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

  private updateOnlineFriendKeys(onlineNicks: string[]) {
    const nextKeys = new Set(onlineNicks.map(normalizeIrcIdentifier));
    if (setsEqual(this.onlineFriendKeys, nextKeys)) {
      return;
    }
    this.onlineFriendKeys = nextKeys;
    emitFriendPresence(this, onlineNicks);
  }

  private hasPendingRawChannelList() {
    return this.pendingReplyContexts.some((context) => context.kind === 'raw-list');
  }

  private isChannelListPending() {
    return this.activeChannelListRequestId !== null || this.drainingChannelListRequestId !== null || this.hasPendingRawChannelList();
  }
}

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
