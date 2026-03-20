import { randomUUID } from 'node:crypto';
import WebSocket from 'ws';
import { encode, type BufferState, type FriendState, type NetworkProfile, type ServerMessage } from '../shared/protocol.js';
import { normalizeIrcIdentifier } from '../shared/irc-identifiers.js';
import { badRequest, notFound } from './app-error.js';
import { IrcConnection } from './irc.js';
import {
  normalizeChannelTarget,
  normalizeFriendNick,
  normalizeMessageBody,
  normalizeMessageTarget,
  normalizeQueryTarget,
  normalizeRawCommand,
} from './irc-validate.js';
import { handleRuntimeEvent } from './runtime-events.js';
import { Storage, type NetworkInput } from './storage.js';

type SaveNetworkResult = {
  network: NetworkProfile;
  serverBuffer: BufferState | null;
};

export class Runtime {
  readonly store: Storage;
  private readonly sockets = new Set<WebSocket>();
  private readonly connections = new Map<string, IrcConnection>();
  private readonly friendPresenceByNetwork = new Map<string, Set<string>>();
  private readonly friendPresenceCache = new Map<string, boolean>();
  private closing = false;

  constructor(store: Storage) {
    this.store = store;
  }

  attachSocket(ws: WebSocket) {
    this.sockets.add(ws);
    ws.on('close', () => this.sockets.delete(ws));
  }

  revokeSession(_sessionToken: string, _legacyUserId?: string) {}

  send(message: ServerMessage): void;
  send(_legacyUserId: string, message: ServerMessage): void;
  send(messageOrLegacyUserId: ServerMessage | string, maybeMessage?: ServerMessage) {
    const message = typeof messageOrLegacyUserId === 'string' ? maybeMessage : messageOrLegacyUserId;
    if (!message) {
      return;
    }
    const payload = encode(message);
    for (const ws of Array.from(this.sockets)) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
        continue;
      }
      if (ws.readyState === WebSocket.CLOSING || ws.readyState === WebSocket.CLOSED) {
        this.sockets.delete(ws);
      }
    }
  }

  close() {
    this.closing = true;
    for (const ws of Array.from(this.sockets)) {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close(1001, 'Server shutting down');
      }
    }
    this.sockets.clear();
    for (const connection of this.connections.values()) {
      connection.disconnect();
    }
    this.connections.clear();
  }

  snapshot(): ReturnType<Storage['snapshot']>;
  snapshot(_legacyUserId: string): ReturnType<Storage['snapshot']>;
  snapshot(_legacyUserId?: string) {
    const snapshot = this.store.snapshot();
    return {
      ...snapshot,
      friendPresence: this.computeFriendPresence(snapshot.friends),
      networkStates: Object.fromEntries(
        snapshot.networks.map((network) => {
          const connection = this.connections.get(network.id);
          return [
            network.id,
            connection
              ? {
                  connected: connection.connected,
                  connecting: !connection.connected && connection.socket !== null,
                  serverName: connection.serverName,
                  nick: connection.currentNick,
                }
              : {
                  connected: false,
                  connecting: false,
                  serverName: null,
                  nick: network.nick,
                },
          ];
        })
      ),
    };
  }

  connect(networkId: string): void;
  connect(_legacyUserId: string, networkId: string, _legacySessionToken?: string): void;
  connect(networkIdOrLegacyUserId: string, maybeNetworkId?: string) {
    this.ensureConnection(resolveNetworkId(networkIdOrLegacyUserId, maybeNetworkId)).connect();
  }

  disconnect(networkId: string): void;
  disconnect(_legacyUserId: string, networkId: string): void;
  disconnect(networkIdOrLegacyUserId: string, maybeNetworkId?: string) {
    const networkId = resolveNetworkId(networkIdOrLegacyUserId, maybeNetworkId);
    this.getRequiredNetwork(networkId);
    this.connections.get(networkId)?.disconnect();
  }

  join(networkId: string, channel: string, sourceBufferId?: string): BufferState;
  join(networkId: string, channel: string, sourceBufferId?: string) {
    return this.joinInternal(networkId, channel, sourceBufferId);
  }

  part(networkId: string, channel: string, sourceBufferId?: string): void;
  part(networkId: string, channel: string, sourceBufferId?: string) {
    this.getRequiredNetwork(networkId);
    const normalizedChannel = normalizeChannelTarget(channel);
    this.connections.get(networkId)?.part(normalizedChannel, 'Leaving', this.resolveReplyTarget(networkId, sourceBufferId, normalizedChannel));
  }

  openQuery(networkId: string, target: string): ReturnType<Storage['upsertQuery']>;
  openQuery(_legacyUserId: string, networkId: string, target: string): ReturnType<Storage['upsertQuery']>;
  openQuery(...args: [string, string] | [string, string, string]) {
    return this.openQueryInternal(...resolveArgsWithValue(args));
  }

  duplicateNetwork(networkId: string): SaveNetworkResult;
  duplicateNetwork(_legacyUserId: string, networkId: string): SaveNetworkResult;
  duplicateNetwork(networkIdOrLegacyUserId: string, maybeNetworkId?: string) {
    return this.duplicateNetworkInternal(resolveNetworkId(networkIdOrLegacyUserId, maybeNetworkId));
  }

  upsertFriend(nick: string): FriendState;
  upsertFriend(_legacyUserId: string, nick: string): FriendState;
  upsertFriend(nickOrLegacyUserId: string, maybeNick?: string) {
    return this.upsertFriendInternal(resolveOptionalId(nickOrLegacyUserId, maybeNick));
  }

  removeFriend(friendId: string): FriendState;
  removeFriend(_legacyUserId: string, friendId: string): FriendState;
  removeFriend(friendIdOrLegacyUserId: string, maybeFriendId?: string) {
    return this.removeFriendInternal(resolveOptionalId(friendIdOrLegacyUserId, maybeFriendId));
  }

  closeBuffer(bufferId: string): BufferState;
  closeBuffer(_legacyUserId: string, bufferId: string): BufferState;
  closeBuffer(bufferIdOrLegacyUserId: string, maybeBufferId?: string) {
    return this.closeBufferInternal(resolveBufferId(bufferIdOrLegacyUserId, maybeBufferId));
  }

  markBufferRead(bufferId: string): ReturnType<Storage['getBuffer']>;
  markBufferRead(_legacyUserId: string, bufferId: string): ReturnType<Storage['getBuffer']>;
  markBufferRead(bufferIdOrLegacyUserId: string, maybeBufferId?: string) {
    return this.markBufferReadInternal(resolveBufferId(bufferIdOrLegacyUserId, maybeBufferId));
  }

  history(bufferId: string, limit: number): ReturnType<Storage['listMessages']>;
  history(_legacyUserId: string, bufferId: string, limit: number): ReturnType<Storage['listMessages']>;
  history(...args: [string, number] | [string, string, number]) {
    return this.historyInternal(...resolveBufferArgsWithLimit(args));
  }

  saveNetwork(data: unknown): SaveNetworkResult;
  saveNetwork(_legacyUserId: string, data: unknown): SaveNetworkResult;
  saveNetwork(...args: [unknown] | [string, unknown]) {
    return this.saveNetworkInternal(resolveNetworkInput(args));
  }

  sendMessage(networkId: string, target: string, body: string, kind?: 'message' | 'action', sourceBufferId?: string): void;
  sendMessage(networkId: string, target: string, body: string, kind: 'message' | 'action' = 'message', sourceBufferId?: string) {
    return this.sendMessageInternal(networkId, target, body, kind, sourceBufferId);
  }

  sendRaw(networkId: string, raw: string, sourceBufferId?: string): void;
  sendRaw(networkId: string, raw: string, sourceBufferId?: string) {
    return this.sendRawInternal(networkId, raw, sourceBufferId);
  }

  deleteNetwork(networkId: string): string[];
  deleteNetwork(_legacyUserId: string, networkId: string): string[];
  deleteNetwork(...args: [string] | [string, string]) {
    return this.deleteNetworkInternal(resolveNetworkIdFromArgs(args));
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
    this.syncFriendTracking();
    this.broadcastFriendPresenceDiffs();
    return friend;
  }

  private removeFriendInternal(friendId: string) {
    const friend = this.store.removeFriend(friendId);
    if (!friend) {
      throw notFound('Friend not found');
    }
    this.friendPresenceCache.delete(friend.id);
    this.syncFriendTracking();
    this.broadcastFriendPresenceDiffs();
    return friend;
  }

  private joinInternal(networkId: string, channel: string, sourceBufferId?: string) {
    this.getRequiredNetwork(networkId);
    const normalizedChannel = normalizeChannelTarget(channel);
    const existingBuffer = this.store.getBufferByTarget(networkId, normalizedChannel);
    const existingChannel = this.store.getChannelByName(networkId, normalizedChannel);
    const existingChannelId = existingBuffer?.kind === 'channel' ? existingBuffer.id : existingChannel?.id;
    const joinedChannelId = existingChannelId ?? randomUUID();
    const connection = this.ensureConnection(networkId);
    const sent = connection.join(
      normalizedChannel,
      this.resolveReplyTarget(networkId, sourceBufferId),
      existingChannelId ? undefined : joinedChannelId
    );
    if (!sent) {
      if (existingBuffer?.kind === 'channel') {
        return existingBuffer;
      }
      return this.store.getServerBuffer(networkId)
        ?? this.store.upsertBuffer({ networkId, kind: 'server', target: 'server' });
    }
    const channelState = this.store.upsertChannel({
      id: joinedChannelId,
      networkId,
      name: normalizedChannel,
      topic: existingChannel?.topic,
      users: existingChannel?.users,
      unread: existingBuffer?.kind === 'channel' ? existingBuffer.unread : undefined,
    });
    return this.store.getBuffer(channelState.id)!;
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
    for (const updatedProfile of updatedProfiles) {
      const runtimeProfile = this.store.getRuntimeNetwork(updatedProfile.id);
      if (runtimeProfile) {
        this.connections.get(updatedProfile.id)?.updateProfile(runtimeProfile);
      }
      this.send({ type: 'network.upsert', network: updatedProfile });
      if (updatedProfile.managerHidden) {
        const nextServerBuffer = this.store.getServerBuffer(updatedProfile.id);
        if (nextServerBuffer) {
          this.send({ type: 'buffer.upsert', buffer: nextServerBuffer });
          if (updatedProfile.id === network.id) {
            serverBuffer = nextServerBuffer;
          }
        }
      }
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
    const connection = this.ensureConnection(networkId);
    const replyTarget = this.resolveReplyTarget(networkId, sourceBufferId, normalizedTarget);
    kind === 'action'
      ? connection.action(normalizedTarget, normalizedBody, replyTarget)
      : connection.say(normalizedTarget, normalizedBody, replyTarget);
  }

  private sendRawInternal(networkId: string, raw: string, sourceBufferId?: string) {
    const normalizedRaw = normalizeRawCommand(raw);
    const connection = this.ensureConnection(networkId);
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

  private deleteNetworkInternal(networkId: string) {
    const deletedNetworkIds = this.getDeleteTargetIds(networkId);
    for (const targetId of deletedNetworkIds) {
      this.connections.get(targetId)?.disconnect();
      this.connections.delete(targetId);
      this.friendPresenceByNetwork.delete(targetId);
    }
    this.broadcastFriendPresenceDiffs();
    this.store.deleteNetwork(networkId);
    for (const targetId of deletedNetworkIds) {
      this.send({ type: 'network.remove', networkId: targetId });
    }
    return deletedNetworkIds;
  }

  private ensureConnection(networkId: string) {
    const profile = this.getRequiredRuntimeNetwork(networkId);
    let connection = this.connections.get(networkId);
    if (!connection) {
      connection = new IrcConnection(profile, {
        onEvent: (event) => {
          if (!this.closing) {
            if (event.type === 'friend-presence') {
              this.handleFriendPresenceEvent(event.networkId, event.onlineNicks);
              return;
            }
            handleRuntimeEvent(this, event);
          }
        },
      });
      connection.setFriendNicks(this.store.listFriends().map((friend) => friend.nick));
      this.connections.set(networkId, connection);
    }
    return connection;
  }

  private handleFriendPresenceEvent(networkId: string, onlineNicks: string[]) {
    this.friendPresenceByNetwork.set(
      networkId,
      new Set(onlineNicks.map(normalizeIrcIdentifier))
    );
    this.broadcastFriendPresenceDiffs();
  }

  private syncFriendTracking() {
    const friendNicks = this.store.listFriends().map((friend) => friend.nick);
    for (const connection of this.connections.values()) {
      connection.setFriendNicks(friendNicks);
    }
  }

  private computeFriendPresence(friends: FriendState[]) {
    return Object.fromEntries(
      friends.map((friend) => [friend.id, this.isFriendOnline(friend.nick)])
    );
  }

  private broadcastFriendPresenceDiffs() {
    const friends = this.store.listFriends();
    const nextPresence = this.computeFriendPresence(friends);
    for (const friend of friends) {
      const online = nextPresence[friend.id] ?? false;
      if (this.friendPresenceCache.get(friend.id) === online) {
        continue;
      }
      this.friendPresenceCache.set(friend.id, online);
      this.send({ type: 'friend.presence', friendId: friend.id, online });
    }
    for (const friendId of Array.from(this.friendPresenceCache.keys())) {
      if (friendId in nextPresence) {
        continue;
      }
      this.friendPresenceCache.delete(friendId);
    }
  }

  private isFriendOnline(nick: string) {
    const normalized = normalizeIrcIdentifier(nick);
    for (const onlineNicks of this.friendPresenceByNetwork.values()) {
      if (onlineNicks.has(normalized)) {
        return true;
      }
    }
    return false;
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

const resolveNetworkId = (networkIdOrLegacyUserId: string, maybeNetworkId?: string) =>
  maybeNetworkId ?? networkIdOrLegacyUserId;

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

const resolveArgsWithValue = (args: ArrayLike<unknown>) =>
  args.length === 3
    ? [String(args[1]), String(args[2])] as const
    : [String(args[0]), String(args[1])] as const;

const resolveBufferId = (bufferIdOrLegacyUserId: string, maybeBufferId?: string) =>
  maybeBufferId ?? bufferIdOrLegacyUserId;

const resolveOptionalId = (idOrLegacyUserId: string, maybeId?: string) =>
  maybeId ?? idOrLegacyUserId;

const resolveBufferArgsWithLimit = (args: ArrayLike<unknown>) =>
  args.length === 3
    ? [String(args[1]), Number(args[2])] as const
    : [String(args[0]), Number(args[1])] as const;

const resolveNetworkInput = (args: ArrayLike<unknown>) =>
  args.length === 2 ? args[1] : args[0];

const resolveNetworkIdFromArgs = (args: ArrayLike<unknown>) =>
  args.length === 2 ? String(args[1]) : String(args[0]);
