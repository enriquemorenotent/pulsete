import { randomUUID } from 'node:crypto';
import WebSocket from 'ws';
import { encode, type ServerMessage } from '../shared/protocol.js';
import { IrcConnection } from './irc.js';
import { handleRuntimeEvent } from './runtime-events.js';
import { Storage } from './storage.js';

const isChannelTarget = (value: string) => /^[#&+!]/.test(value);

export class Runtime {
  readonly store: Storage;
  private readonly sockets = new Map<string, Set<WebSocket>>();
  private readonly connections = new Map<string, Map<string, IrcConnection>>();

  constructor(store: Storage) {
    this.store = store;
  }

  attachSocket(userId: string, ws: WebSocket) {
    const sockets = this.sockets.get(userId) ?? new Set<WebSocket>();
    sockets.add(ws);
    this.sockets.set(userId, sockets);
    ws.on('close', () => this.detachSocket(userId, ws));
  }

  send(userId: string, message: ServerMessage) {
    const payload = encode(message);
    for (const ws of this.sockets.get(userId) ?? []) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      }
    }
  }

  snapshot(userId: string) { return this.store.snapshot(userId); }
  connect(userId: string, networkId: string) { this.ensureConnection(userId, networkId).connect(); }
  disconnect(userId: string, networkId: string) { this.connections.get(userId)?.get(networkId)?.disconnect(); }

  join(userId: string, networkId: string, channel: string) {
    this.store.upsertChannel(userId, { id: randomUUID(), networkId, name: channel, topic: '', unread: 0, users: [] });
    this.ensureConnection(userId, networkId).join(channel);
  }

  part(userId: string, networkId: string, channel: string) { this.connections.get(userId)?.get(networkId)?.part(channel); }
  openQuery(userId: string, networkId: string, target: string) { return this.store.upsertQuery(userId, networkId, target); }
  closeQuery(userId: string, networkId: string, target: string) { this.store.deleteQuery(userId, networkId, target); }
  markChannelRead(userId: string, channelId: string) { this.store.markChannelRead(userId, channelId); }
  history(userId: string, networkId: string, target: string, limit: number) { return this.store.listMessages(userId, networkId, target, limit); }
  saveNetwork(userId: string, data: unknown) { return this.store.upsertNetwork(userId, data as Parameters<Storage['upsertNetwork']>[1]); }

  sendMessage(userId: string, networkId: string, target: string, body: string, kind: 'message' | 'action' = 'message') {
    const connection = this.ensureConnection(userId, networkId);
    if (!isChannelTarget(target) && target !== 'server') {
      this.send(userId, { type: 'query.open', query: this.store.upsertQuery(userId, networkId, target) });
    }
    kind === 'action' ? connection.action(target, body) : connection.say(target, body);
  }

  sendRaw(userId: string, networkId: string, raw: string) {
    const connection = this.ensureConnection(userId, networkId);
    if (/^\s*NICK\s+/i.test(raw)) {
      const nextNick = raw.trim().split(/\s+/)[1];
      if (nextNick) {
        connection.setNick(nextNick);
        return;
      }
    }
    if (/^\s*QUIT/i.test(raw)) {
      connection.disconnect();
      return;
    }
    connection.sendRaw(raw);
  }

  deleteNetwork(userId: string, networkId: string) {
    this.disconnect(userId, networkId);
    this.store.deleteNetwork(userId, networkId);
  }

  private detachSocket(userId: string, ws: WebSocket) {
    const sockets = this.sockets.get(userId);
    sockets?.delete(ws);
    if (sockets && sockets.size === 0) {
      this.sockets.delete(userId);
    }
  }

  private ensureConnection(userId: string, networkId: string) {
    const profile = this.store.getNetwork(userId, networkId);
    if (!profile) {
      throw new Error('Network not found');
    }
    const userConnections = this.connections.get(userId) ?? new Map<string, IrcConnection>();
    let connection = userConnections.get(networkId);
    if (!connection) {
      connection = new IrcConnection(profile, { onEvent: (event) => handleRuntimeEvent(this, userId, event) });
      userConnections.set(networkId, connection);
      this.connections.set(userId, userConnections);
    }
    return connection;
  }
}
