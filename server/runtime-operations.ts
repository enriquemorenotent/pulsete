import type WebSocket from 'ws';
import { isConnectionInstance } from '../shared/network-model.js';
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
import { RuntimeConnectionManager } from './runtime-connection-manager.js';
import { RuntimeConversations } from './runtime-conversations.js';
import {
  createDuplicateNetworkName,
  getRequiredNetwork,
  getRequiredRuntimeNetwork,
  resolveReplyTarget,
} from './runtime-operation-utils.js';
import { parseNetworkInput } from './network-input.js';
import { type NetworkInput, Storage } from './storage.js';

type RuntimeOperationsOptions = {
  store: Storage;
  connectionManager: RuntimeConnectionManager;
  conversations: RuntimeConversations;
  send(message: ServerMessage): void;
};

export class RuntimeOperations {
  private readonly store: Storage;
  private readonly connectionManager: RuntimeConnectionManager;
  private readonly conversations: RuntimeConversations;
  private readonly send: RuntimeOperationsOptions['send'];

  constructor(options: RuntimeOperationsOptions) {
    this.store = options.store;
    this.connectionManager = options.connectionManager;
    this.conversations = options.conversations;
    this.send = options.send;
  }

  openQuery(networkId: string, target: string) {
    getRequiredNetwork(this.store, networkId);
    return this.conversations.openQuery(networkId, normalizeQueryTarget(target));
  }

  duplicateNetwork(networkId: string) {
    const network = getRequiredNetwork(this.store, networkId);
    if (isConnectionInstance(network)) {
      throw badRequest('Only saved networks can be duplicated');
    }
    const runtimeProfile = getRequiredRuntimeNetwork(this.store, networkId);
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

  upsertFriend(nick: string) {
    const friend = this.store.upsertFriend({ nick: normalizeFriendNick(nick) });
    this.send({ type: 'friend.upsert', friend });
    this.connectionManager.syncFriendTracking();
    this.connectionManager.broadcastFriendPresenceDiffs();
    return friend;
  }

  removeFriend(friendId: string) {
    const friend = this.store.removeFriend(friendId);
    if (!friend) {
      throw notFound('Friend not found');
    }
    this.connectionManager.deleteFriendPresenceCache(friend.id);
    this.connectionManager.syncFriendTracking();
    this.connectionManager.broadcastFriendPresenceDiffs();
    this.send({ type: 'friend.remove', friendId: friend.id });
    return friend;
  }

  join(networkId: string, channel: string, sourceBufferId?: string) {
    getRequiredNetwork(this.store, networkId);
    const normalizedChannel = normalizeChannelTarget(channel);
    const existingBuffer = this.store.getBufferByTarget(networkId, normalizedChannel);
    const existingChannel = this.store.getChannelByName(networkId, normalizedChannel);
    this.connectionManager.getConnection(networkId).join(
      normalizedChannel,
      resolveReplyTarget(this.store, networkId, sourceBufferId),
      { visiblePending: !(existingBuffer?.kind === 'channel' || existingChannel) }
    );
  }

  part(networkId: string, channel: string, sourceBufferId?: string) {
    getRequiredNetwork(this.store, networkId);
    const normalizedChannel = normalizeChannelTarget(channel);
    this.connectionManager.getConnection(networkId)
      .part(normalizedChannel, 'Leaving', resolveReplyTarget(this.store, networkId, sourceBufferId, normalizedChannel));
  }

  closeBuffer(bufferId: string) {
    return this.conversations.closeQueryBuffer(bufferId);
  }

  markBufferRead(bufferId: string) {
    return this.conversations.markBufferRead(bufferId);
  }

  history(bufferId: string, limit: number) {
    return this.conversations.listBufferHistory(bufferId, limit);
  }

  saveNetwork(data: unknown, networkId?: string) {
    const input = parseNetworkInput(data, networkId);
    if (networkId) {
      getRequiredNetwork(this.store, networkId);
    }
    const network = this.store.upsertNetwork(input);
    const updatedProfiles = [network, ...this.syncTemplateInstances(network, input)];
    let serverBuffer = isConnectionInstance(network) ? this.store.getServerBuffer(network.id) : null;
    this.connectionManager.updateProfiles(updatedProfiles.map((profile) => profile.id));
    for (const updatedProfile of updatedProfiles) {
      if (isConnectionInstance(updatedProfile)) {
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

  sendMessage(networkId: string, target: string, body: string, kind: 'message' | 'action' = 'message', sourceBufferId?: string) {
    const normalizedTarget = normalizeMessageTarget(target);
    const normalizedBody = normalizeMessageBody(body);
    const connection = this.connectionManager.getConnection(networkId);
    const replyTarget = resolveReplyTarget(this.store, networkId, sourceBufferId, normalizedTarget);
    kind === 'action'
      ? connection.action(normalizedTarget, normalizedBody, replyTarget)
      : connection.say(normalizedTarget, normalizedBody, replyTarget);
  }

  sendRaw(networkId: string, raw: string, sourceBufferId?: string) {
    const normalizedRaw = normalizeRawCommand(raw);
    const connection = this.connectionManager.getConnection(networkId);
    const replyTarget = resolveReplyTarget(this.store, networkId, sourceBufferId);
    if (/^\s*NICK\s+/i.test(normalizedRaw)) {
      const nextNick = normalizedRaw.trim().split(/\s+/)[1];
      if (nextNick) {
        connection.socket ? connection.setNick(nextNick, replyTarget) : connection.sendRaw(normalizedRaw, replyTarget);
        return;
      }
    }
    if (/^\s*QUIT(?:\s|$)/i.test(normalizedRaw)) {
      connection.socket ? connection.disconnect(normalizedRaw.trim()) : connection.sendRaw(normalizedRaw, replyTarget);
      return;
    }
    connection.sendClientRaw(normalizedRaw, replyTarget);
  }

  requestChannelList(networkId: string, requester?: WebSocket) {
    getRequiredNetwork(this.store, networkId);
    return this.connectionManager.requestChannelList(networkId, requester);
  }

  deleteNetwork(networkId: string) {
    const deletedNetworkIds = this.store
      .listNetworks()
      .filter((candidate) => candidate.id === networkId || (isConnectionInstance(candidate) && candidate.templateId === networkId))
      .map((candidate) => candidate.id);
    if (deletedNetworkIds.length === 0) {
      throw notFound('Network not found');
    }
    this.connectionManager.removeNetworks(deletedNetworkIds);
    this.store.deleteNetwork(networkId);
    for (const targetId of deletedNetworkIds) {
      this.send({ type: 'network.remove', networkId: targetId });
    }
    return deletedNetworkIds;
  }
  private syncTemplateInstances(profile: NetworkProfile, input: NetworkInput) {
    if (isConnectionInstance(profile)) {
      return [];
    }
    return this.store
      .listNetworks()
      .filter((candidate) => isConnectionInstance(candidate) && candidate.templateId === profile.id)
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

}
