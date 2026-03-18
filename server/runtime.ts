import WebSocket from 'ws';
import { encode, type NetworkProfile, type ServerMessage } from '../shared/protocol.js';
import { notFound, unauthorized } from './app-error.js';
import { IrcConnection } from './irc.js';
import {
  normalizeChannelTarget,
  normalizeMessageBody,
  normalizeMessageTarget,
  normalizeQueryTarget,
  normalizeRawCommand,
} from './irc-validate.js';
import { handleRuntimeEvent } from './runtime-events.js';
import { Storage } from './storage.js';

const maxSessionTimerDelayMs = 2_147_483_647;

export class Runtime {
  readonly store: Storage;
  private readonly sockets = new Map<string, Map<WebSocket, string>>();
  private readonly connections = new Map<string, Map<string, IrcConnection>>();
  private readonly sessionExpiryTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(store: Storage) {
    this.store = store;
  }

  attachSocket(userId: string, sessionToken: string, ws: WebSocket) {
    const sockets = this.sockets.get(userId) ?? new Map<WebSocket, string>();
    sockets.set(ws, sessionToken);
    this.sockets.set(userId, sockets);
    this.syncUserSession(userId);
    ws.on('close', () => this.detachSocket(userId, ws));
  }

  revokeSession(sessionToken: string, userId?: string) {
    for (const sockets of this.sockets.values()) {
      for (const [ws, token] of sockets) {
        if (token === sessionToken) {
          ws.close(1008, 'Authentication required');
        }
      }
    }
    if (userId) {
      this.syncUserSession(userId);
    }
  }

  send(userId: string, message: ServerMessage) {
    this.pruneUserSockets(userId);
    if (!this.store.hasActiveSessions(userId)) {
      this.closeUserSockets(userId);
      this.disconnectUser(userId);
      this.clearUserSessionTimer(userId);
      return;
    }
    const payload = encode(message);
    for (const [ws, sessionToken] of this.sockets.get(userId) ?? []) {
      const session = this.store.getSession(sessionToken);
      if (!session || session.user.id !== userId) {
        ws.close(1008, 'Authentication required');
        continue;
      }
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      }
    }
  }

  close() {
    for (const userId of Array.from(this.sessionExpiryTimers.keys())) {
      this.clearUserSessionTimer(userId);
    }
    for (const sockets of this.sockets.values()) {
      for (const ws of Array.from(sockets.keys())) {
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          ws.close(1001, 'Server shutting down');
        }
      }
    }
    this.sockets.clear();
    for (const userId of Array.from(this.connections.keys())) {
      this.disconnectUser(userId);
    }
  }

  snapshot(userId: string) { return this.store.snapshot(userId); }
  connect(userId: string, networkId: string, sessionToken?: string) {
    this.syncUserSession(userId);
    this.assertLiveSession(userId, sessionToken);
    this.ensureConnection(userId, networkId).connect();
  }
  disconnect(userId: string, networkId: string) {
    this.getRequiredNetwork(userId, networkId);
    this.connections.get(userId)?.get(networkId)?.disconnect();
  }

  join(userId: string, networkId: string, channel: string) {
    const normalizedChannel = normalizeChannelTarget(channel);
    const connection = this.ensureConnection(userId, networkId);
    connection.join(normalizedChannel);
  }

  part(userId: string, networkId: string, channel: string) {
    this.getRequiredNetwork(userId, networkId);
    const normalizedChannel = normalizeChannelTarget(channel);
    this.connections.get(userId)?.get(networkId)?.part(normalizedChannel);
  }
  openQuery(userId: string, networkId: string, target: string) {
    this.getRequiredNetwork(userId, networkId);
    return this.store.upsertQuery(userId, networkId, normalizeQueryTarget(target));
  }
  closeQuery(userId: string, networkId: string, target: string) {
    this.getRequiredNetwork(userId, networkId);
    const normalizedTarget = normalizeQueryTarget(target);
    this.store.deleteQuery(userId, networkId, normalizedTarget);
    return normalizedTarget;
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
    const updatedProfiles = [profile, ...this.syncTemplateInstances(userId, profile, input)];
    for (const updatedProfile of updatedProfiles) {
      const runtimeProfile = this.store.getRuntimeNetwork(userId, updatedProfile.id);
      if (runtimeProfile) {
        this.connections.get(userId)?.get(updatedProfile.id)?.updateProfile(runtimeProfile);
      }
      this.send(userId, { type: 'network.upsert', network: updatedProfile });
    }
    return profile;
  }

  sendMessage(userId: string, networkId: string, target: string, body: string, kind: 'message' | 'action' = 'message') {
    const normalizedTarget = normalizeMessageTarget(target);
    const normalizedBody = normalizeMessageBody(body);
    const connection = this.ensureConnection(userId, networkId);
    kind === 'action' ? connection.action(normalizedTarget, normalizedBody) : connection.say(normalizedTarget, normalizedBody);
  }

  sendRaw(userId: string, networkId: string, raw: string) {
    const normalizedRaw = normalizeRawCommand(raw);
    const connection = this.ensureConnection(userId, networkId);
    if (/^\s*NICK\s+/i.test(normalizedRaw)) {
      const nextNick = normalizedRaw.trim().split(/\s+/)[1];
      if (nextNick) {
        connection.setNick(nextNick);
        return;
      }
    }
    if (/^\s*QUIT/i.test(normalizedRaw)) {
      connection.disconnect();
      return;
    }
    connection.sendRaw(normalizedRaw);
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

  private closeUserSockets(userId: string) {
    for (const ws of Array.from(this.sockets.get(userId)?.keys() ?? [])) {
      ws.close(1008, 'Authentication required');
    }
  }

  private disconnectUser(userId: string) {
    const userConnections = this.connections.get(userId);
    if (!userConnections) {
      return;
    }
    this.connections.delete(userId);
    for (const connection of userConnections.values()) {
      connection.disconnect();
    }
  }

  private pruneUserSockets(userId: string) {
    for (const [ws, sessionToken] of this.sockets.get(userId) ?? []) {
      const session = this.store.getSession(sessionToken);
      if (!session || session.user.id !== userId) {
        ws.close(1008, 'Authentication required');
      }
    }
  }

  private clearUserSessionTimer(userId: string) {
    const timer = this.sessionExpiryTimers.get(userId);
    if (timer) {
      clearTimeout(timer);
      this.sessionExpiryTimers.delete(userId);
    }
  }

  private assertLiveSession(userId: string, sessionToken?: string) {
    if (!sessionToken) {
      return;
    }
    const session = this.store.getSession(sessionToken);
    if (session && session.user.id === userId) {
      return;
    }
    this.revokeSession(sessionToken, userId);
    throw unauthorized('Authentication required');
  }

  private syncUserSession(userId: string) {
    this.clearUserSessionTimer(userId);
    const nextExpiry = this.store.getNextSessionExpiry(userId);
    if (!nextExpiry) {
      this.closeUserSockets(userId);
      this.disconnectUser(userId);
      return;
    }
    const delay = Math.max(0, nextExpiry - Date.now());
    const scheduledDelay = Math.min(delay, maxSessionTimerDelayMs);
    const callback = delay > maxSessionTimerDelayMs
      ? () => this.syncUserSession(userId)
      : () => this.handleUserSessionExpiry(userId, nextExpiry);
    const timer = setTimeout(callback, scheduledDelay);
    timer.unref?.();
    this.sessionExpiryTimers.set(userId, timer);
  }

  private handleUserSessionExpiry(userId: string, expectedExpiry: number) {
    const nextExpiry = this.store.getNextSessionExpiry(userId);
    if (nextExpiry && nextExpiry > expectedExpiry) {
      this.pruneUserSockets(userId);
      this.syncUserSession(userId);
      return;
    }
    this.pruneUserSockets(userId);
    if (!this.store.hasActiveSessions(userId)) {
      this.closeUserSockets(userId);
      this.disconnectUser(userId);
      this.clearUserSessionTimer(userId);
      return;
    }
    this.syncUserSession(userId);
  }

  private ensureConnection(userId: string, networkId: string) {
    const profile = this.getRequiredRuntimeNetwork(userId, networkId);
    const userConnections = this.connections.get(userId) ?? new Map<string, IrcConnection>();
    let connection = userConnections.get(networkId);
    if (!connection) {
      connection = new IrcConnection(profile, {
        onEvent: (event) => {
          if (!this.store.hasActiveSessions(userId)) {
            this.closeUserSockets(userId);
            this.disconnectUser(userId);
            this.clearUserSessionTimer(userId);
            return;
          }
          handleRuntimeEvent(this, userId, event);
        },
      });
      userConnections.set(networkId, connection);
      this.connections.set(userId, userConnections);
    }
    return connection;
  }

  private getRequiredRuntimeNetwork(userId: string, networkId: string) {
    const profile = this.store.getRuntimeNetwork(userId, networkId);
    if (!profile) {
      throw notFound('Network not found');
    }
    return profile;
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

  private syncTemplateInstances(
    userId: string,
    profile: NetworkProfile,
    input: Parameters<Storage['upsertNetwork']>[1]
  ) {
    if (profile.managerHidden) {
      return [];
    }
    return this.store
      .listNetworks(userId)
      .filter((candidate) => candidate.managerHidden && candidate.templateId === profile.id)
      .map((candidate) => this.store.upsertNetwork(userId, {
        id: candidate.id,
        templateId: profile.id,
        managerHidden: true,
        name: profile.name,
        host: profile.host,
        port: profile.port,
        tls: profile.tls,
        nick: profile.nick,
        altNicks: profile.altNicks,
        username: profile.username,
        realName: profile.realName,
        favorite: profile.favorite,
        autoJoin: profile.autoJoin,
        ...(input.password !== undefined ? { password: input.password } : {}),
        ...(input.clearPassword ? { clearPassword: true } : {}),
      }));
  }
}
