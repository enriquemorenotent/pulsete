import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import {
  historyWindowLimit,
  type AppSnapshot,
  type BufferState,
  type ChannelState,
  type ChannelUserState,
  type FriendState,
  type NetworkProfile,
} from '../shared/protocol.js';
import { createSecretBox } from './network-secret.js';
import { createDatabase } from './storage-db.js';
import {
  deleteChannelByName,
  getBuffer,
  getBufferByTarget,
  getChannel,
  getChannelByName,
  getServerBuffer,
  listBuffers,
  listChannels,
  markBufferRead,
  removeBuffer,
  setBufferUnread,
  updateChannelTopic,
  updateChannelUsers,
  upsertBuffer,
  upsertChannel,
} from './storage-buffers.js';
import { getFriend, listFriends, removeFriend, upsertFriend } from './storage-friends.js';
import { appendMessage, getMessageById, listMessages, listRecentMessages } from './storage-messages.js';
import {
  deleteNetwork,
  ensureDefaultNetworks,
  getNetwork,
  getRuntimeNetwork,
  hasEncryptedNetworkPasswords,
  listNetworks,
  migrateLegacyNetworkPasswords,
  upsertNetwork,
} from './storage-networks.js';
import type { ChannelInput, FriendInput, MessageInput, NetworkInput, RuntimeNetworkProfile } from './storage-types.js';

export { type MessageInput, type NetworkInput };

type LegacyUser = { id: string; username: string; password: string };
type LegacySession = { token: string; userId: string; createdAt: number; expiresAt: number; user: { id: string; username: string } };

export class Storage {
  private readonly db: DatabaseSync;
  private readonly secretBox;
  private readonly legacyUsers = new Map<string, LegacyUser>();
  private readonly legacySessions = new Map<string, LegacySession>();
  private sessionCleanupTimer: ReturnType<typeof setInterval> | null = null;
  private closed = false;

  constructor(filePath?: string, options: { sessionCleanupIntervalMs?: number } = {}) {
    this.db = createDatabase(filePath);
    this.secretBox = createSecretBox(filePath, { createIfMissing: !hasEncryptedNetworkPasswords(this.db) });
    migrateLegacyNetworkPasswords(this.db, this.secretBox);
    const sessionCleanupIntervalMs = Number(options.sessionCleanupIntervalMs ?? 0);
    if (Number.isFinite(sessionCleanupIntervalMs) && sessionCleanupIntervalMs > 0) {
      this.sessionCleanupTimer = setInterval(() => this.deleteExpiredSessions(), sessionCleanupIntervalMs);
      this.sessionCleanupTimer.unref?.();
    }
  }

  hasUsers() { return this.legacyUsers.size > 0; }

  bootstrapUser(username: string, password: string) {
    return this.createLegacyUser(username, password);
  }

  createUser(username: string, password: string) {
    return this.createLegacyUser(username, password);
  }

  authenticate(username: string, password: string) {
    const normalized = username.trim();
    const user = Array.from(this.legacyUsers.values()).find((candidate) => candidate.username.trim() === normalized);
    return user && user.password === password ? { id: user.id, username: user.username } : null;
  }

  getUserById(userId: string) {
    const user = this.legacyUsers.get(userId);
    return user ? { id: user.id, username: user.username } : null;
  }

  createSession(userId: string) {
    const user = this.getUserById(userId) ?? { id: userId, username: 'pulsete' };
    const token = randomUUID();
    const createdAt = Date.now();
    const expiresAt = createdAt + 1000 * 60 * 60 * 24 * 30;
    const session = { token, userId, createdAt, expiresAt, user };
    this.legacySessions.set(token, session);
    return session;
  }

  getSession(token: string) {
    const session = this.legacySessions.get(token);
    if (!session) {
      return null;
    }
    if (session.expiresAt < Date.now()) {
      this.legacySessions.delete(token);
      return null;
    }
    return session;
  }

  deleteSession(token: string) { this.legacySessions.delete(token); }

  deleteExpiredSessions() {
    for (const [token, session] of this.legacySessions) {
      if (session.expiresAt < Date.now()) {
        this.legacySessions.delete(token);
      }
    }
  }

  getNextSessionExpiry(userId: string) {
    const expiries = Array.from(this.legacySessions.values())
      .filter((session) => session.userId === userId && session.expiresAt >= Date.now())
      .map((session) => session.expiresAt)
      .sort((left, right) => left - right);
    return expiries[0] ?? null;
  }

  hasActiveSessions(userId: string) {
    return Array.from(this.legacySessions.values())
      .some((session) => session.userId === userId && session.expiresAt >= Date.now());
  }

  listNetworks(): NetworkProfile[];
  listNetworks(_legacyUserId: string): NetworkProfile[];
  listNetworks() {
    this.ensureDefaultNetworks();
    return listNetworks(this.db);
  }

  getNetwork(networkId: string): NetworkProfile | null;
  getNetwork(_legacyUserId: string, networkId: string): NetworkProfile | null;
  getNetwork(networkIdOrLegacyUserId: string, maybeNetworkId?: string) {
    return getNetwork(this.db, resolveOptionalId(networkIdOrLegacyUserId, maybeNetworkId));
  }

  getRuntimeNetwork(networkId: string): RuntimeNetworkProfile | null;
  getRuntimeNetwork(_legacyUserId: string, networkId: string): RuntimeNetworkProfile | null;
  getRuntimeNetwork(networkIdOrLegacyUserId: string, maybeNetworkId?: string) {
    return getRuntimeNetwork(this.db, resolveOptionalId(networkIdOrLegacyUserId, maybeNetworkId), this.secretBox);
  }

  deleteNetwork(networkId: string): void;
  deleteNetwork(_legacyUserId: string, networkId: string): void;
  deleteNetwork(networkIdOrLegacyUserId: string, maybeNetworkId?: string) {
    deleteNetwork(this.db, resolveOptionalId(networkIdOrLegacyUserId, maybeNetworkId));
  }

  listChannels(networkId?: string): ChannelState[];
  listChannels(_legacyUserId: string, networkId?: string): ChannelState[];
  listChannels(networkIdOrLegacyUserId?: string, maybeNetworkId?: string) {
    return listChannels(this.db, resolveOptionalNetworkId(this.db, networkIdOrLegacyUserId, maybeNetworkId));
  }

  listBuffers(networkId?: string): BufferState[];
  listBuffers(_legacyUserId: string, networkId?: string): BufferState[];
  listBuffers(networkIdOrLegacyUserId?: string, maybeNetworkId?: string) {
    return listBuffers(this.db, resolveOptionalNetworkId(this.db, networkIdOrLegacyUserId, maybeNetworkId));
  }

  listFriends(): FriendState[];
  listFriends(_legacyUserId: string): FriendState[];
  listFriends() {
    return listFriends(this.db);
  }

  getBuffer(bufferId: string): BufferState | null;
  getBuffer(_legacyUserId: string, bufferId: string): BufferState | null;
  getBuffer(bufferIdOrLegacyUserId: string, maybeBufferId?: string) {
    return getBuffer(this.db, resolveOptionalId(bufferIdOrLegacyUserId, maybeBufferId));
  }

  getBufferByTarget(networkId: string, target: string): BufferState | null;
  getBufferByTarget(_legacyUserId: string, networkId: string, target: string): BufferState | null;
  getBufferByTarget(networkIdOrLegacyUserId: string, networkIdOrTarget: string, maybeTarget?: string) {
    const [networkId, target] = maybeTarget
      ? [networkIdOrTarget, maybeTarget]
      : [networkIdOrLegacyUserId, networkIdOrTarget];
    return getBufferByTarget(this.db, networkId, target);
  }

  getServerBuffer(networkId: string): BufferState | null;
  getServerBuffer(_legacyUserId: string, networkId: string): BufferState | null;
  getServerBuffer(networkIdOrLegacyUserId: string, maybeNetworkId?: string) {
    return getServerBuffer(this.db, resolveOptionalId(networkIdOrLegacyUserId, maybeNetworkId));
  }

  getChannel(channelId: string): ChannelState | null;
  getChannel(_legacyUserId: string, channelId: string): ChannelState | null;
  getChannel(channelIdOrLegacyUserId: string, maybeChannelId?: string) {
    return getChannel(this.db, resolveOptionalId(channelIdOrLegacyUserId, maybeChannelId));
  }

  getChannelByName(networkId: string, name: string): ChannelState | null;
  getChannelByName(_legacyUserId: string, networkId: string, name: string): ChannelState | null;
  getChannelByName(networkIdOrLegacyUserId: string, networkIdOrName: string, maybeName?: string) {
    const [networkId, name] = maybeName
      ? [networkIdOrName, maybeName]
      : [networkIdOrLegacyUserId, networkIdOrName];
    return getChannelByName(this.db, networkId, name);
  }

  getFriend(friendId: string): FriendState | null;
  getFriend(_legacyUserId: string, friendId: string): FriendState | null;
  getFriend(friendIdOrLegacyUserId: string, maybeFriendId?: string) {
    return getFriend(this.db, resolveOptionalId(friendIdOrLegacyUserId, maybeFriendId));
  }

  markBufferRead(bufferId: string): void;
  markBufferRead(_legacyUserId: string, bufferId: string): void;
  markBufferRead(bufferIdOrLegacyUserId: string, maybeBufferId?: string) {
    markBufferRead(this.db, resolveOptionalId(bufferIdOrLegacyUserId, maybeBufferId));
  }

  removeBuffer(bufferId: string): BufferState | null;
  removeBuffer(_legacyUserId: string, bufferId: string): BufferState | null;
  removeBuffer(bufferIdOrLegacyUserId: string, maybeBufferId?: string) {
    return removeBuffer(this.db, resolveOptionalId(bufferIdOrLegacyUserId, maybeBufferId));
  }

  deleteChannelByName(networkId: string, channelName: string): void;
  deleteChannelByName(_legacyUserId: string, networkId: string, channelName: string): void;
  deleteChannelByName(networkIdOrLegacyUserId: string, networkIdOrName: string, maybeName?: string) {
    const [networkId, channelName] = maybeName
      ? [networkIdOrName, maybeName]
      : [networkIdOrLegacyUserId, networkIdOrName];
    deleteChannelByName(this.db, networkId, channelName);
  }

  setBufferUnread(bufferId: string, unread: number): void;
  setBufferUnread(_legacyUserId: string, bufferId: string, unread: number): void;
  setBufferUnread(bufferIdOrLegacyUserId: string, unreadOrLegacyBufferId: string | number, maybeUnread?: number) {
    const [bufferId, unread] = typeof unreadOrLegacyBufferId === 'number'
      ? [bufferIdOrLegacyUserId, unreadOrLegacyBufferId]
      : [unreadOrLegacyBufferId, maybeUnread ?? 0];
    setBufferUnread(this.db, bufferId, unread);
  }

  updateChannelUsers(networkId: string, channelName: string, users: ChannelUserState[]): void;
  updateChannelUsers(_legacyUserId: string, networkId: string, channelName: string, users: ChannelUserState[]): void;
  updateChannelUsers(
    networkIdOrLegacyUserId: string,
    networkIdOrName: string,
    channelNameOrUsers: string | ChannelUserState[],
    maybeUsers?: ChannelUserState[]
  ) {
    const [networkId, channelName, users] = Array.isArray(channelNameOrUsers)
      ? [networkIdOrLegacyUserId, networkIdOrName, channelNameOrUsers]
      : [networkIdOrName, channelNameOrUsers, maybeUsers ?? []];
    updateChannelUsers(this.db, networkId, channelName, users);
  }

  updateChannelTopic(networkId: string, channelName: string, topic: string): void;
  updateChannelTopic(_legacyUserId: string, networkId: string, channelName: string, topic: string): void;
  updateChannelTopic(networkIdOrLegacyUserId: string, networkIdOrName: string, channelNameOrTopic: string, maybeTopic?: string) {
    const [networkId, channelName, topic] = maybeTopic
      ? [networkIdOrName, channelNameOrTopic, maybeTopic]
      : [networkIdOrLegacyUserId, networkIdOrName, channelNameOrTopic];
    updateChannelTopic(this.db, networkId, channelName, topic);
  }

  getMessageById(messageId: string): MessageInput | null;
  getMessageById(_legacyUserId: string, messageId: string): MessageInput | null;
  getMessageById(messageIdOrLegacyUserId: string, maybeMessageId?: string) {
    return getMessageById(this.db, resolveOptionalId(messageIdOrLegacyUserId, maybeMessageId));
  }

  listMessages(networkId: string, target: string, limit?: number): MessageInput[];
  listMessages(_legacyUserId: string, networkId: string, target: string, limit?: number): MessageInput[];
  listMessages(networkIdOrLegacyUserId: string, networkIdOrTarget: string, targetOrLimit?: string | number, maybeLimit?: number) {
    const [networkId, target, limit] = typeof targetOrLimit === 'number'
      ? [networkIdOrLegacyUserId, networkIdOrTarget, targetOrLimit]
      : [networkIdOrTarget, String(targetOrLimit), maybeLimit];
    return listMessages(this.db, networkId, target, limit);
  }

  listRecentMessages(limit = 200) { return listRecentMessages(this.db, limit); }

  ensureDefaultNetworks() {
    ensureDefaultNetworks(this.db, (input) => this.upsertNetwork(input));
  }

  upsertNetwork(input: NetworkInput): NetworkProfile;
  upsertNetwork(_legacyUserId: string, input: NetworkInput): NetworkProfile;
  upsertNetwork(inputOrLegacyUserId: NetworkInput | string, maybeInput?: NetworkInput) {
    const network = upsertNetwork(this.db, resolveInput(inputOrLegacyUserId, maybeInput), this.secretBox);
    if (network.managerHidden) {
      this.ensureServerBuffer(network.id);
    }
    return network;
  }

  upsertChannel(input: ChannelInput): ChannelState;
  upsertChannel(_legacyUserId: string, input: ChannelInput): ChannelState;
  upsertChannel(inputOrLegacyUserId: ChannelInput | string, maybeInput?: ChannelInput) {
    return upsertChannel(this.db, resolveInput(inputOrLegacyUserId, maybeInput));
  }

  upsertBuffer(input: { id?: string; networkId: string; kind: BufferState['kind']; target: string; unread?: number }): BufferState;
  upsertBuffer(_legacyUserId: string, input: { id?: string; networkId: string; kind: BufferState['kind']; target: string; unread?: number }): BufferState;
  upsertBuffer(inputOrLegacyUserId: { id?: string; networkId: string; kind: BufferState['kind']; target: string; unread?: number } | string, maybeInput?: { id?: string; networkId: string; kind: BufferState['kind']; target: string; unread?: number }) {
    return upsertBuffer(this.db, resolveInput(inputOrLegacyUserId, maybeInput));
  }

  upsertQuery(networkId: string, target: string): BufferState;
  upsertQuery(_legacyUserId: string, networkId: string, target: string): BufferState;
  upsertQuery(networkIdOrLegacyUserId: string, networkIdOrTarget: string, maybeTarget?: string) {
    const [networkId, target] = maybeTarget
      ? [networkIdOrTarget, maybeTarget]
      : [networkIdOrLegacyUserId, networkIdOrTarget];
    return upsertBuffer(this.db, { networkId, kind: 'query', target });
  }

  upsertFriend(input: FriendInput): FriendState;
  upsertFriend(_legacyUserId: string, input: FriendInput): FriendState;
  upsertFriend(inputOrLegacyUserId: FriendInput | string, maybeInput?: FriendInput) {
    return upsertFriend(this.db, resolveInput(inputOrLegacyUserId, maybeInput));
  }

  removeFriend(friendId: string): FriendState | null;
  removeFriend(_legacyUserId: string, friendId: string): FriendState | null;
  removeFriend(friendIdOrLegacyUserId: string, maybeFriendId?: string) {
    return removeFriend(this.db, resolveOptionalId(friendIdOrLegacyUserId, maybeFriendId));
  }

  appendMessage(input: MessageInput): MessageInput;
  appendMessage(_legacyUserId: string, input: MessageInput): MessageInput;
  appendMessage(inputOrLegacyUserId: MessageInput | string, maybeInput?: MessageInput) {
    return appendMessage(this.db, resolveInput(inputOrLegacyUserId, maybeInput), (messageId) => this.getMessageById(messageId));
  }

  snapshot(): AppSnapshot;
  snapshot(_legacyUserId: string): AppSnapshot;
  snapshot() {
    this.ensureDefaultNetworks();
    this.ensureServerBuffers();
    const networks = this.listNetworks();
    return {
      networks,
      friends: this.listFriends(),
      friendPresence: {},
      buffers: this.listBuffers(),
      channels: this.listChannels(),
      messages: this.listRecentMessages(historyWindowLimit),
      networkStates: {},
    };
  }

  close() {
    if (this.closed) {
      return;
    }
    this.closed = true;
    if (this.sessionCleanupTimer) {
      clearInterval(this.sessionCleanupTimer);
      this.sessionCleanupTimer = null;
    }
    this.db.close();
  }

  private createLegacyUser(username: string, password: string) {
    const user = { id: randomUUID(), username, password };
    this.legacyUsers.set(user.id, user);
    return { id: user.id, username: user.username };
  }

  private ensureServerBuffer(networkId: string) {
    if (!getServerBuffer(this.db, networkId)) {
      upsertBuffer(this.db, {
        networkId,
        kind: 'server',
        target: 'server',
      });
    }
  }

  private ensureServerBuffers() {
    for (const network of this.listNetworks().filter((item) => item.managerHidden)) {
      this.ensureServerBuffer(network.id);
    }
  }
}

const resolveOptionalId = (value: string, maybeValue?: string) => maybeValue ?? value;

const resolveOptionalNetworkId = (
  _db: DatabaseSync,
  networkIdOrLegacyUserId?: string,
  maybeNetworkId?: string
) => {
  if (maybeNetworkId) {
    return maybeNetworkId;
  }
  return networkIdOrLegacyUserId;
};

const resolveInput = <T>(value: T | string, maybeValue?: T) =>
  (typeof value === 'string' ? maybeValue : value)!;
