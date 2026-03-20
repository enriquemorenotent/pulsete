import { randomUUID } from 'node:crypto';
import type { MessageInput } from './storage.js';
import { connectSocket } from './irc-connect.js';
import { emitMessage, emitState, emitStatus } from './irc-emit.js';
import { handleIrcLine } from './irc-handle-line.js';
import { findIrcCaseMatch, isSameIrcIdentifier } from './irc-parser.js';
import {
  consumeReplyTarget,
  createChannelReplyContext,
  createMessageReplyContext,
  createNickReplyContext,
  createReplyContextFromRaw,
  type PendingReplyContext,
} from './irc-reply-context.js';
import type { Handlers, IrcConnectionState, IrcSocket } from './irc-types.js';
import type { RuntimeNetworkProfile } from './storage-types.js';

export class IrcConnection implements IrcConnectionState {
  socket: IrcSocket | null = null;
  buffer = '';
  readonly channelUsers = new Map<string, Set<string>>();
  manualDisconnect = false;
  reconnectAttempts = 0;
  reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  connected = false;
  serverName: string | null = null;
  currentNick: string;
  pendingNick: string | null = null;
  lastFailureMessage: string | null = null;
  pendingReplyContexts: PendingReplyContext[] = [];
  profile: RuntimeNetworkProfile;

  constructor(
    profile: RuntimeNetworkProfile,
    readonly handlers: Handlers
  ) {
    this.profile = profile;
    this.currentNick = profile.nick;
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
    this.lastFailureMessage = null;
    connectSocket(this);
  }

  disconnect(raw = 'QUIT :Client disconnecting') {
    this.manualDisconnect = true;
    this.reconnectAttempts = 0;
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

  join(channel: string, sourceTarget = 'server') {
    this.sendTrackedRaw(`JOIN ${channel}`, sourceTarget, createChannelReplyContext(sourceTarget, channel));
  }

  part(channel: string, reason = 'Leaving', sourceTarget = channel) {
    this.sendTrackedRaw(`PART ${channel} :${reason}`, sourceTarget, createChannelReplyContext(sourceTarget, channel));
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
    if (this.connected) {
      this.pendingNick = nick;
    } else {
      this.currentNick = nick;
    }
    this.sendTrackedRaw(`NICK ${nick}`, sourceTarget, createNickReplyContext(sourceTarget));
    if (!this.connected) {
      emitState(this);
    }
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

  resetTransientState() {
    this.buffer = '';
    this.channelUsers.clear();
    this.pendingNick = null;
    this.pendingReplyContexts = [];
  }

  queueReplyContext(context: PendingReplyContext) {
    this.pendingReplyContexts.push(context);
  }

  consumeReplyTarget(command: string, params: string[], nick: string | null, rawTarget?: string) {
    return consumeReplyTarget(this.pendingReplyContexts, command, params, nick, rawTarget);
  }

  sendRaw(raw: string, statusTarget?: string) {
    if (!this.socket) {
      emitStatus(this, 'Not connected', 'error', statusTarget);
      return false;
    }
    this.socket.write(`${raw}\r\n`);
    return true;
  }

  sendClientRaw(raw: string, sourceTarget = 'server') {
    const replyContext = createReplyContextFromRaw(sourceTarget, raw);
    return this.sendTrackedRaw(raw, sourceTarget, replyContext);
  }

  consume(chunk: string) {
    this.buffer += chunk;
    let newlineIndex = this.buffer.indexOf('\n');
    while (newlineIndex !== -1) {
      const line = this.buffer.slice(0, newlineIndex).replace(/\r$/, '');
      this.buffer = this.buffer.slice(newlineIndex + 1);
      if (line.length > 0) {
        handleIrcLine(this, line);
      }
      newlineIndex = this.buffer.indexOf('\n');
    }
  }

  updateChannelUsers(channel: string, nick: string | null, joined: boolean) {
    const channelKey = findIrcCaseMatch(this.channelUsers.keys(), channel) ?? channel;
    const current = this.channelUsers.get(channelKey) ?? new Set<string>();
    if (nick) {
      const existingNick = findIrcCaseMatch(current, nick);
      if (joined) {
        if (existingNick && existingNick !== nick) {
          current.delete(existingNick);
        }
        current.add(nick);
      } else if (existingNick) {
        current.delete(existingNick);
      }
    }
    this.channelUsers.set(channelKey, current);
    return Array.from(current);
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
    if (!this.sendRaw(raw, sourceTarget)) {
      return false;
    }
    if (replyContext) {
      this.queueReplyContext(replyContext);
    }
    return true;
  }
}

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
