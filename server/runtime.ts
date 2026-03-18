import WebSocket from 'ws';
import { encode, type ServerMessage } from '../shared/protocol.js';
import { badRequest, notFound } from './app-error.js';
import { IrcConnection } from './irc.js';
import { handleRuntimeEvent } from './runtime-events.js';
import { Storage } from './storage.js';

const isChannelTarget = (value: string) => /^[#&+!]/.test(value);
const invalidChannelTargetMessage = 'Channel name must start with #, &, +, or !';
const invalidQueryTargetMessage = 'Private-message target is required';

const normalizeChannelTarget = (value: string) => {
  const target = value.trim();
  if (!target || !isChannelTarget(target)) {
    throw badRequest(invalidChannelTargetMessage);
  }
  return target;
};

const normalizeQueryTarget = (value: string) => {
  const target = value.trim();
  if (!target || target === 'server' || isChannelTarget(target)) {
    throw badRequest(invalidQueryTargetMessage);
  }
  return target;
};

const normalizeMessageTarget = (value: string) => {
  const target = value.trim();
  return isChannelTarget(target) ? target : normalizeQueryTarget(target);
};

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
  disconnect(userId: string, networkId: string) {
    this.getRequiredNetwork(userId, networkId);
    this.connections.get(userId)?.get(networkId)?.disconnect();
  }

  join(userId: string, networkId: string, channel: string) {
    const connection = this.ensureConnection(userId, networkId);
    connection.join(normalizeChannelTarget(channel));
  }

  part(userId: string, networkId: string, channel: string) {
    this.getRequiredNetwork(userId, networkId);
    this.connections.get(userId)?.get(networkId)?.part(channel);
  }
  openQuery(userId: string, networkId: string, target: string) {
    this.getRequiredNetwork(userId, networkId);
    return this.store.upsertQuery(userId, networkId, normalizeQueryTarget(target));
  }
  closeQuery(userId: string, networkId: string, target: string) {
    this.getRequiredNetwork(userId, networkId);
    this.store.deleteQuery(userId, networkId, target);
  }
  markChannelRead(userId: string, channelId: string) {
    const channel = this.getRequiredChannel(userId, channelId);
    if (channel.unread === 0) {
      return channel;
    }
    this.store.markChannelRead(userId, channelId);
    const updatedChannel = this.getRequiredChannel(userId, channelId);
    this.send(userId, { type: 'channel.snapshot', channel: updatedChannel });
    return updatedChannel;
  }
  history(userId: string, networkId: string, target: string, limit: number) {
    this.getRequiredNetwork(userId, networkId);
    return this.store.listMessages(userId, networkId, target, limit);
  }
  saveNetwork(userId: string, data: unknown) {
    const input = data as Parameters<Storage['upsertNetwork']>[1];
    if (input.id) {
      this.getRequiredNetwork(userId, input.id);
    }
    const profile = this.store.upsertNetwork(userId, input);
    this.connections.get(userId)?.get(profile.id)?.updateProfile(profile);
    return profile;
  }

  sendMessage(userId: string, networkId: string, target: string, body: string, kind: 'message' | 'action' = 'message') {
    const connection = this.ensureConnection(userId, networkId);
    const normalizedTarget = normalizeMessageTarget(target);
    kind === 'action' ? connection.action(normalizedTarget, body) : connection.say(normalizedTarget, body);
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
    const deletedNetworkIds = this.getDeleteTargetIds(userId, networkId);
    for (const targetId of deletedNetworkIds) {
      this.connections.get(userId)?.get(targetId)?.disconnect();
      this.deleteConnection(userId, targetId);
    }
    this.store.deleteNetwork(userId, networkId);
    for (const targetId of deletedNetworkIds) {
      this.send(userId, { type: 'network.remove', networkId: targetId });
    }
    return deletedNetworkIds;
  }

  private detachSocket(userId: string, ws: WebSocket) {
    const sockets = this.sockets.get(userId);
    sockets?.delete(ws);
    if (sockets && sockets.size === 0) {
      this.sockets.delete(userId);
    }
  }

  private deleteConnection(userId: string, networkId: string) {
    const userConnections = this.connections.get(userId);
    userConnections?.delete(networkId);
    if (userConnections && userConnections.size === 0) {
      this.connections.delete(userId);
    }
  }

  private ensureConnection(userId: string, networkId: string) {
    const profile = this.getRequiredNetwork(userId, networkId);
    const userConnections = this.connections.get(userId) ?? new Map<string, IrcConnection>();
    let connection = userConnections.get(networkId);
    if (!connection) {
      connection = new IrcConnection(profile, { onEvent: (event) => handleRuntimeEvent(this, userId, event) });
      userConnections.set(networkId, connection);
      this.connections.set(userId, userConnections);
    }
    return connection;
  }

  private getRequiredNetwork(userId: string, networkId: string) {
    const profile = this.store.getNetwork(userId, networkId);
    if (!profile) {
      throw notFound('Network not found');
    }
    return profile;
  }

  private getRequiredChannel(userId: string, channelId: string) {
    const channel = this.store.getChannel(userId, channelId);
    if (!channel) {
      throw notFound('Channel not found');
    }
    return channel;
  }

  private getDeleteTargetIds(userId: string, networkId: string) {
    const network = this.getRequiredNetwork(userId, networkId);
    return this.store
      .listNetworks(userId)
      .filter((candidate) => candidate.id === network.id || candidate.templateId === network.id)
      .map((candidate) => candidate.id);
  }
}
