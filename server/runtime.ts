import WebSocket from 'ws';
import type { NetworkProfile, ServerMessage } from '../shared/protocol.js';
import { badRequest, notFound } from './app-error.js';
import {
  normalizeChannelTarget,
  normalizeFriendNick,
  normalizeMessageBody,
  normalizeMessageTarget,
  normalizeQueryTarget,
  normalizeRawCommand,
} from './irc-validate.js';
import type { IrcConnection } from './irc.js';
import { RuntimeConnectionManager } from './runtime-connection-manager.js';
import { handleRuntimeEvent } from './runtime-events.js';
import { RuntimeSocketHub } from './runtime-socket-hub.js';
import { Storage, type NetworkInput } from './storage.js';

export class Runtime {
  readonly store: Storage;
  readonly connections: Map<string, IrcConnection>;
  private readonly socketHub: RuntimeSocketHub;
  private readonly connectionManager: RuntimeConnectionManager;
  private closing = false;

  constructor(store: Storage) {
    this.store = store;
    this.socketHub = new RuntimeSocketHub((ws) => this.connectionManager.removeSocket(ws));
    this.connectionManager = new RuntimeConnectionManager({
      store,
      send: (message) => this.send(message),
      sendSocket: (ws, message) => this.socketHub.sendSocket(ws, message),
      onRuntimeEvent: (event) => handleRuntimeEvent(this, event),
      isClosing: () => this.closing,
    });
    this.connections = this.connectionManager.connections;
  }

  attachSocket(ws: WebSocket) {
    this.socketHub.attach(ws);
  }

  detachSocket(ws: WebSocket) {
    this.socketHub.detach(ws);
  }

  send(message: ServerMessage) {
    this.socketHub.broadcast(message);
  }

  close() {
    this.closing = true;
    this.socketHub.closeAll();
    this.connectionManager.close();
  }

  snapshot() {
    const snapshot = this.store.snapshot();
    return {
      ...snapshot,
      ...this.connectionManager.snapshot(snapshot.networks, snapshot.friends),
    };
  }

  connect(networkId: string) {
    this.getRequiredNetwork(networkId);
    this.connectionManager.getConnection(networkId).connect();
  }

  disconnect(networkId: string) {
    this.getRequiredNetwork(networkId);
    this.connectionManager.disconnect(networkId);
  }

  join(networkId: string, channel: string, sourceBufferId?: string) {
    return this.joinInternal(networkId, channel, sourceBufferId);
  }

  part(networkId: string, channel: string, sourceBufferId?: string) {
    this.getRequiredNetwork(networkId);
    const normalizedChannel = normalizeChannelTarget(channel);
    this.connectionManager.getConnection(networkId)
      .part(normalizedChannel, 'Leaving', this.resolveReplyTarget(networkId, sourceBufferId, normalizedChannel));
  }

  openQuery(networkId: string, target: string) {
    return this.openQueryInternal(networkId, target);
  }

  duplicateNetwork(networkId: string) {
    return this.duplicateNetworkInternal(networkId);
  }

  upsertFriend(nick: string) {
    return this.upsertFriendInternal(nick);
  }

  removeFriend(friendId: string) {
    return this.removeFriendInternal(friendId);
  }

  closeBuffer(bufferId: string) {
    return this.closeBufferInternal(bufferId);
  }

  markBufferRead(bufferId: string) {
    return this.markBufferReadInternal(bufferId);
  }

  history(bufferId: string, limit: number) {
    return this.historyInternal(bufferId, limit);
  }

  saveNetwork(data: unknown) {
    return this.saveNetworkInternal(data);
  }

  sendMessage(networkId: string, target: string, body: string, kind: 'message' | 'action' = 'message', sourceBufferId?: string) {
    return this.sendMessageInternal(networkId, target, body, kind, sourceBufferId);
  }

  sendRaw(networkId: string, raw: string, sourceBufferId?: string) {
    return this.sendRawInternal(networkId, raw, sourceBufferId);
  }

  requestChannelList(networkId: string, requester?: WebSocket) {
    return this.requestChannelListInternal(networkId, requester);
  }

  cancelChannelList(networkId: string, requester: WebSocket) {
    this.connectionManager.cancelChannelList(networkId, requester);
  }

  deleteNetwork(networkId: string) {
    return this.deleteNetworkInternal(networkId);
  }

  private openQueryInternal(networkId: string, target: string) {
    this.getRequiredNetwork(networkId);
    return this.store.upsertQuery(networkId, normalizeQueryTarget(target));
  }

  private duplicateNetworkInternal(networkId: string) {
    const network = this.getRequiredNetwork(networkId);
    if (network.managerHidden) {
      throw badRequest('Only saved networks can be duplicated');
    }
    const runtimeProfile = this.getRequiredRuntimeNetwork(networkId);
    const duplicate = this.store.upsertNetwork({
      templateId: null,
      managerHidden: false,
      name: createDuplicateNetworkName(network.name, this.store.listNetworks()),
      host: network.host,
      port: network.port,
      tls: network.tls,
      nick: network.nick,
      altNicks: network.altNicks,
      username: network.username,
      realName: network.realName,
      password: runtimeProfile.password,
      favorite: network.favorite,
      autoJoin: network.autoJoin,
    });
    this.send({ type: 'network.upsert', network: duplicate });
    return { network: duplicate, serverBuffer: null };
  }

  private upsertFriendInternal(nick: string) {
    const friend = this.store.upsertFriend({ nick: normalizeFriendNick(nick) });
    this.connectionManager.syncFriendTracking();
    this.connectionManager.broadcastFriendPresenceDiffs();
    return friend;
  }

  private removeFriendInternal(friendId: string) {
    const friend = this.store.removeFriend(friendId);
    if (!friend) {
      throw notFound('Friend not found');
    }
    this.connectionManager.deleteFriendPresenceCache(friend.id);
    this.connectionManager.syncFriendTracking();
    this.connectionManager.broadcastFriendPresenceDiffs();
    return friend;
  }

  private joinInternal(networkId: string, channel: string, sourceBufferId?: string) {
    this.getRequiredNetwork(networkId);
    const normalizedChannel = normalizeChannelTarget(channel);
    const existingBuffer = this.store.getBufferByTarget(networkId, normalizedChannel);
    const existingChannel = this.store.getChannelByName(networkId, normalizedChannel);
    const connection = this.connectionManager.getConnection(networkId);
    connection.join(
      normalizedChannel,
      this.resolveReplyTarget(networkId, sourceBufferId),
      { visiblePending: !(existingBuffer?.kind === 'channel' || existingChannel) }
    );
  }

  private closeBufferInternal(bufferId: string) {
    const buffer = this.getRequiredBuffer(bufferId);
    if (buffer.kind !== 'query') {
      throw badRequest('Only private message buffers can be closed');
    }
    return this.store.removeBuffer(bufferId) ?? buffer;
  }

  private markBufferReadInternal(bufferId: string) {
    const buffer = this.getRequiredBuffer(bufferId);
    if (buffer.unread === 0) {
      return buffer;
    }
    this.store.markBufferRead(bufferId);
    const updatedBuffer = this.getRequiredBuffer(bufferId);
    this.send({ type: 'buffer.upsert', buffer: updatedBuffer });
    return updatedBuffer;
  }

  private historyInternal(bufferId: string, limit: number) {
    const buffer = this.getRequiredBuffer(bufferId);
    return this.store.listMessages(buffer.networkId, buffer.target, limit);
  }

  private saveNetworkInternal(data: unknown) {
    const input = data as NetworkInput;
    if (input.id) {
      this.getRequiredNetwork(input.id);
    }
    const network = this.store.upsertNetwork(input);
    const updatedProfiles = [network, ...this.syncTemplateInstances(network, input)];
    let serverBuffer = network.managerHidden ? this.store.getServerBuffer(network.id) : null;
    this.connectionManager.updateProfiles(updatedProfiles.map((profile) => profile.id));
    for (const updatedProfile of updatedProfiles) {
      if (updatedProfile.managerHidden) {
        const nextServerBuffer = this.store.getServerBuffer(updatedProfile.id);
        if (nextServerBuffer) {
          this.send({ type: 'buffer.upsert', buffer: nextServerBuffer });
          if (updatedProfile.id === network.id) {
            serverBuffer = nextServerBuffer;
          }
        }
      }
      this.send({ type: 'network.upsert', network: updatedProfile });
    }
    return { network, serverBuffer };
  }

  private sendMessageInternal(
    networkId: string,
    target: string,
    body: string,
    kind: 'message' | 'action' = 'message',
    sourceBufferId?: string
  ) {
    const normalizedTarget = normalizeMessageTarget(target);
    const normalizedBody = normalizeMessageBody(body);
    const connection = this.connectionManager.getConnection(networkId);
    const replyTarget = this.resolveReplyTarget(networkId, sourceBufferId, normalizedTarget);
    kind === 'action'
      ? connection.action(normalizedTarget, normalizedBody, replyTarget)
      : connection.say(normalizedTarget, normalizedBody, replyTarget);
  }

  private sendRawInternal(networkId: string, raw: string, sourceBufferId?: string) {
    const normalizedRaw = normalizeRawCommand(raw);
    const connection = this.connectionManager.getConnection(networkId);
    const replyTarget = this.resolveReplyTarget(networkId, sourceBufferId);
    if (/^\s*NICK\s+/i.test(normalizedRaw)) {
      const nextNick = normalizedRaw.trim().split(/\s+/)[1];
      if (nextNick) {
        if (connection.socket) {
          connection.setNick(nextNick, replyTarget);
        } else {
          connection.sendRaw(normalizedRaw, replyTarget);
        }
        return;
      }
    }
    if (/^\s*QUIT(?:\s|$)/i.test(normalizedRaw)) {
      if (connection.socket) {
        connection.disconnect(normalizedRaw.trim());
      } else {
        connection.sendRaw(normalizedRaw, replyTarget);
      }
      return;
    }
    connection.sendClientRaw(normalizedRaw, replyTarget);
  }

  private requestChannelListInternal(networkId: string, requester?: WebSocket) {
    this.getRequiredNetwork(networkId);
    return this.connectionManager.requestChannelList(networkId, requester);
  }

  private deleteNetworkInternal(networkId: string) {
    const deletedNetworkIds = this.getDeleteTargetIds(networkId);
    this.connectionManager.removeNetworks(deletedNetworkIds);
    this.store.deleteNetwork(networkId);
    for (const targetId of deletedNetworkIds) {
      this.send({ type: 'network.remove', networkId: targetId });
    }
    return deletedNetworkIds;
  }

  private getRequiredRuntimeNetwork(networkId: string) {
    const profile = this.store.getRuntimeNetwork(networkId);
    if (!profile) {
      throw notFound('Network not found');
    }
    return profile;
  }

  private getRequiredNetwork(networkId: string) {
    const profile = this.store.getNetwork(networkId);
    if (!profile) {
      throw notFound('Network not found');
    }
    return profile;
  }

  private getRequiredBuffer(bufferId: string) {
    const buffer = this.store.getBuffer(bufferId);
    if (!buffer) {
      throw notFound('Buffer not found');
    }
    return buffer;
  }

  private getDeleteTargetIds(networkId: string) {
    const network = this.getRequiredNetwork(networkId);
    return this.store
      .listNetworks()
      .filter((candidate) => candidate.id === network.id || candidate.templateId === network.id)
      .map((candidate) => candidate.id);
  }

  private syncTemplateInstances(
    profile: NetworkProfile,
    input: NetworkInput
  ) {
    if (profile.managerHidden) {
      return [];
    }
    return this.store
      .listNetworks()
      .filter((candidate) => candidate.managerHidden && candidate.templateId === profile.id)
      .map((candidate) => this.store.upsertNetwork({
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

  private resolveReplyTarget(networkId: string, sourceBufferId?: string, fallbackTarget = 'server') {
    if (!sourceBufferId) {
      return fallbackTarget;
    }
    const buffer = this.store.getBuffer(sourceBufferId);
    return buffer?.networkId === networkId ? buffer.target : fallbackTarget;
  }
}

const createDuplicateNetworkName = (name: string, networks: NetworkProfile[]) => {
  const existingNames = new Set(
    networks
      .filter((network) => !network.managerHidden)
      .map((network) => network.name.toLocaleLowerCase())
  );
  const baseName = `${name} copy`;
  if (!existingNames.has(baseName.toLocaleLowerCase())) {
    return baseName;
  }
  let suffix = 2;
  while (existingNames.has(`${baseName} ${suffix}`.toLocaleLowerCase())) {
    suffix += 1;
  }
  return `${baseName} ${suffix}`;
};
