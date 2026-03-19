import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { historyWindowLimit, type AppSnapshot, type ChannelState, type NetworkProfile, type QueryBuffer } from '../shared/protocol.js';
import { createSecretBox } from './network-secret.js';
import { createDatabase } from './storage-db.js';
import {
  deleteChannelByName,
  deleteQuery,
  getChannel,
  getChannelByName,
  getQuery,
  listChannels,
  listQueries,
  markChannelRead,
  setChannelUnread,
  updateChannelTopic,
  updateChannelUsers,
  upsertChannel,
  upsertQuery,
} from './storage-buffers.js';
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
import type { ChannelInput, MessageInput, NetworkInput, RuntimeNetworkProfile } from './storage-types.js';

export { type MessageInput, type NetworkInput };

type LegacyUser = { id: string; username: string; password: string };
type LegacySession = { token: string; userId: string; createdAt: number; expiresAt: number; user: { id: string; username: string } };

export class Storage {
  private readonly db: DatabaseSync;
  private readonly secretBox;
  private readonly legacyUsers = new Map<string, LegacyUser>();
  private readonly legacySessions = new Map<string, LegacySession>();
  private closed = false;

  constructor(filePath?: string, _options: { sessionCleanupIntervalMs?: number } = {}) {
    this.db = createDatabase(filePath);
    this.secretBox = createSecretBox(filePath, { createIfMissing: !hasEncryptedNetworkPasswords(this.db) });
    migrateLegacyNetworkPasswords(this.db, this.secretBox);
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
    return session && session.expiresAt >= Date.now() ? session : null;
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
  listNetworks() { return listNetworks(this.db); }

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

  listQueries(networkId?: string): QueryBuffer[];
  listQueries(_legacyUserId: string, networkId?: string): QueryBuffer[];
  listQueries(networkIdOrLegacyUserId?: string, maybeNetworkId?: string) {
    return listQueries(this.db, resolveOptionalNetworkId(this.db, networkIdOrLegacyUserId, maybeNetworkId));
  }

  getChannel(channelId: string): ChannelState | null;
  getChannel(_legacyUserId: string, channelId: string): ChannelState | null;
  getChannel(channelIdOrLegacyUserId: string, maybeChannelId?: string) {
    return getChannel(this.db, resolveOptionalId(channelIdOrLegacyUserId, maybeChannelId));
  }

  getQuery(networkId: string, target: string): QueryBuffer | null;
  getQuery(_legacyUserId: string, networkId: string, target: string): QueryBuffer | null;
  getQuery(networkIdOrLegacyUserId: string, networkIdOrTarget: string, maybeTarget?: string) {
    const [networkId, target] = maybeTarget
      ? [networkIdOrTarget, maybeTarget]
      : [networkIdOrLegacyUserId, networkIdOrTarget];
    return getQuery(this.db, networkId, target);
  }

  getChannelByName(networkId: string, name: string): ChannelState | null;
  getChannelByName(_legacyUserId: string, networkId: string, name: string): ChannelState | null;
  getChannelByName(networkIdOrLegacyUserId: string, networkIdOrName: string, maybeName?: string) {
    const [networkId, name] = maybeName
      ? [networkIdOrName, maybeName]
      : [networkIdOrLegacyUserId, networkIdOrName];
    return getChannelByName(this.db, networkId, name);
  }

  markChannelRead(channelId: string): void;
  markChannelRead(_legacyUserId: string, channelId: string): void;
  markChannelRead(channelIdOrLegacyUserId: string, maybeChannelId?: string) {
    markChannelRead(this.db, resolveOptionalId(channelIdOrLegacyUserId, maybeChannelId));
  }

  deleteQuery(networkId: string, target: string): void;
  deleteQuery(_legacyUserId: string, networkId: string, target: string): void;
  deleteQuery(networkIdOrLegacyUserId: string, networkIdOrTarget: string, maybeTarget?: string) {
    const [networkId, target] = maybeTarget
      ? [networkIdOrTarget, maybeTarget]
      : [networkIdOrLegacyUserId, networkIdOrTarget];
    deleteQuery(this.db, networkId, target);
  }

  deleteChannelByName(networkId: string, channelName: string): void;
  deleteChannelByName(_legacyUserId: string, networkId: string, channelName: string): void;
  deleteChannelByName(networkIdOrLegacyUserId: string, networkIdOrName: string, maybeName?: string) {
    const [networkId, channelName] = maybeName
      ? [networkIdOrName, maybeName]
      : [networkIdOrLegacyUserId, networkIdOrName];
    deleteChannelByName(this.db, networkId, channelName);
  }

  setChannelUnread(networkId: string, channelName: string, unread: number): void;
  setChannelUnread(_legacyUserId: string, networkId: string, channelName: string, unread: number): void;
  setChannelUnread(networkIdOrLegacyUserId: string, networkIdOrName: string, channelNameOrUnread: string | number, maybeUnread?: number) {
    const [networkId, channelName, unread] = typeof channelNameOrUnread === 'number'
      ? [networkIdOrLegacyUserId, networkIdOrName, channelNameOrUnread]
      : [networkIdOrName, channelNameOrUnread, maybeUnread ?? 0];
    setChannelUnread(this.db, networkId, channelName, unread);
  }

  updateChannelUsers(networkId: string, channelName: string, users: string[]): void;
  updateChannelUsers(_legacyUserId: string, networkId: string, channelName: string, users: string[]): void;
  updateChannelUsers(networkIdOrLegacyUserId: string, networkIdOrName: string, channelNameOrUsers: string | string[], maybeUsers?: string[]) {
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
    return upsertNetwork(this.db, resolveInput(inputOrLegacyUserId, maybeInput), this.secretBox);
  }

  upsertChannel(input: ChannelInput): ChannelState;
  upsertChannel(_legacyUserId: string, input: ChannelInput): ChannelState;
  upsertChannel(inputOrLegacyUserId: ChannelInput | string, maybeInput?: ChannelInput) {
    const input = resolveInput(inputOrLegacyUserId, maybeInput);
    return upsertChannel(this.db, input, (networkId, name) => this.getChannelByName(networkId, name));
  }

  upsertQuery(networkId: string, target: string): QueryBuffer;
  upsertQuery(_legacyUserId: string, networkId: string, target: string): QueryBuffer;
  upsertQuery(networkIdOrLegacyUserId: string, networkIdOrTarget: string, maybeTarget?: string) {
    const [networkId, target] = maybeTarget
      ? [networkIdOrTarget, maybeTarget]
      : [networkIdOrLegacyUserId, networkIdOrTarget];
    return upsertQuery(this.db, networkId, target, (nextNetworkId, nextTarget) => this.getQuery(nextNetworkId, nextTarget));
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
    const networks = this.listNetworks();
    const channels = this.listChannels();
    const activeNetworkId = networks[0]?.id ?? null;
    const activeChannel = channels.find((channel) => channel.networkId === activeNetworkId);
    return {
      networks,
      channels,
      queries: this.listQueries(),
      messages: this.listRecentMessages(historyWindowLimit),
      activeNetworkId,
      activeBuffer: activeChannel ? `${activeNetworkId}:${activeChannel.name}` : activeNetworkId ? `${activeNetworkId}:server` : '',
    };
  }

  close() {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.db.close();
  }

  private createLegacyUser(username: string, password: string) {
    const user = { id: randomUUID(), username, password };
    this.legacyUsers.set(user.id, user);
    return { id: user.id, username: user.username };
  }
}

const resolveOptionalId = (value: string, maybeValue?: string) => maybeValue ?? value;

const resolveOptionalNetworkId = (
  db: DatabaseSync,
  networkIdOrLegacyUserId?: string,
  maybeNetworkId?: string
) => {
  if (maybeNetworkId) {
    return maybeNetworkId;
  }
  if (!networkIdOrLegacyUserId) {
    return undefined;
  }
  return getNetwork(db, networkIdOrLegacyUserId) ? networkIdOrLegacyUserId : undefined;
};

const resolveInput = <T>(value: T | string, maybeValue?: T) =>
  (typeof value === 'string' ? maybeValue : value)!;
