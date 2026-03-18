import { randomUUID } from 'node:crypto';
import type { MessageInput } from './storage.js';
import { connectSocket } from './irc-connect.js';
import { emitMessage, emitState, emitStatus } from './irc-emit.js';
import { handleIrcLine } from './irc-handle-line.js';
import type { Handlers, IrcConnectionState, IrcSocket } from './irc-types.js';
import type { NetworkProfile } from '../shared/protocol.js';

export class IrcConnection implements IrcConnectionState {
  socket: IrcSocket | null = null;
  buffer = '';
  readonly channelUsers = new Map<string, Set<string>>();
  manualDisconnect = false;
  reconnectAttempts = 0;
  connected = false;
  serverName: string | null = null;
  currentNick: string;

  constructor(
    readonly profile: NetworkProfile,
    readonly handlers: Handlers
  ) {
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
    connectSocket(this);
  }

  disconnect() {
    this.manualDisconnect = true;
    this.reconnectAttempts = 0;
    if (this.socket) {
      this.sendRaw('QUIT :Client disconnecting');
      this.socket.end();
      this.socket = null;
    }
    this.connected = false;
  }

  join(channel: string) { this.sendRaw(`JOIN ${channel}`); }
  part(channel: string, reason = 'Leaving') { this.sendRaw(`PART ${channel} :${reason}`); }

  say(target: string, text: string) {
    emitMessage(this, this.createSelfMessage(target, text));
    this.sendRaw(`PRIVMSG ${target} :${text}`);
  }

  action(target: string, text: string) {
    emitMessage(this, this.createSelfMessage(target, `* ${this.currentNick} ${text}`));
    this.sendRaw(`PRIVMSG ${target} :\u0001ACTION ${text}\u0001`);
  }

  setNick(nick: string) {
    this.currentNick = nick;
    this.sendRaw(`NICK ${nick}`);
    emitState(this);
  }

  sendRaw(raw: string) {
    if (!this.socket) {
      emitStatus(this, 'Not connected', 'error');
      return;
    }
    this.socket.write(`${raw}\r\n`);
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
