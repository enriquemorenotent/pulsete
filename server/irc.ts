import { randomUUID } from 'node:crypto';
import type { MessageInput } from './storage.js';
import { connectSocket } from './irc-connect.js';
import { emitMessage, emitState, emitStatus } from './irc-emit.js';
import { handleIrcLine } from './irc-handle-line.js';
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

  connect() {
    this.clearReconnectTimer();
    connectSocket(this);
  }

  disconnect() {
    this.manualDisconnect = true;
    this.reconnectAttempts = 0;
    this.clearReconnectTimer();
    const socket = this.socket;
    if (socket) {
      this.sendRaw('QUIT :Client disconnecting');
      socket.end();
      this.socket = null;
    }
    const wasActive = this.connected || socket !== null || this.serverName !== null;
    this.resetTransientState();
    this.connected = false;
    this.serverName = null;
    this.currentNick = this.profile.nick;
    if (wasActive) {
      emitState(this);
      emitStatus(this, 'Disconnected from server');
    }
  }

  join(channel: string) { this.sendRaw(`JOIN ${channel}`); }
  part(channel: string, reason = 'Leaving') { this.sendRaw(`PART ${channel} :${reason}`); }

  say(target: string, text: string) {
    if (this.sendRaw(`PRIVMSG ${target} :${text}`)) {
      emitMessage(this, this.createSelfMessage(target, text));
    }
  }

  action(target: string, text: string) {
    if (this.sendRaw(`PRIVMSG ${target} :\u0001ACTION ${text}\u0001`)) {
      emitMessage(this, this.createSelfMessage(target, `* ${this.currentNick} ${text}`));
    }
  }

  setNick(nick: string) {
    this.currentNick = nick;
    this.sendRaw(`NICK ${nick}`);
    emitState(this);
  }

  updateProfile(profile: RuntimeNetworkProfile) {
    const reconnectPending = !this.connected && this.socket !== null;
    if (reconnectPending) {
      const socket = this.socket;
      this.socket = null;
      this.resetTransientState();
      socket?.destroy();
    }
    this.profile = profile;
    if (!this.connected) {
      this.currentNick = profile.nick;
    }
    if (reconnectPending) {
      connectSocket(this);
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
  }

  sendRaw(raw: string) {
    if (!this.socket) {
      emitStatus(this, 'Not connected', 'error');
      return false;
    }
    this.socket.write(`${raw}\r\n`);
    return true;
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
    const current = this.channelUsers.get(channel) ?? new Set<string>();
    if (nick) {
      joined ? current.add(nick) : current.delete(nick);
    }
    this.channelUsers.set(channel, current);
    return Array.from(current);
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
}
