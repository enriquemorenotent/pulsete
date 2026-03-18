import type { DatabaseSync } from 'node:sqlite';
import { historyWindowLimit, type AppSnapshot, type ChannelState, type NetworkProfile, type QueryBuffer } from '../shared/protocol.js';
import { createDatabase } from './storage-db.js';
import {
  authenticate,
  bootstrapUser,
  createSession,
  createUser,
  deleteExpiredSessions,
  deleteSession,
  getSession,
  getUserById,
  hasUsers,
} from './storage-auth.js';
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
import { deleteNetwork, ensureDefaultNetworks, getNetwork, listNetworks, upsertNetwork } from './storage-networks.js';
import type { AuthUser, ChannelInput, MessageInput, NetworkInput, SessionRecord } from './storage-types.js';

export { type AuthUser, type MessageInput, type NetworkInput };

export class Storage {
  private readonly db: DatabaseSync;

  constructor(filePath?: string) {
    this.db = createDatabase(filePath);
  }

  hasUsers() { return hasUsers(this.db); }
  createUser(username: string, password: string): AuthUser { return createUser(this.db, username, password); }
  bootstrapUser(username: string, password: string): AuthUser { return bootstrapUser(this.db, username, password); }
  authenticate(username: string, password: string): AuthUser | null { return authenticate(this.db, username, password); }
  getUserById(userId: string): AuthUser | null { return getUserById(this.db, userId); }
  createSession(userId: string) { return createSession(this.db, userId); }
  getSession(token: string): SessionRecord | null { return getSession(this.db, token); }
  deleteSession(token: string) { deleteSession(this.db, token); }
  deleteExpiredSessions() { deleteExpiredSessions(this.db); }
  listNetworks(userId: string): NetworkProfile[] { return listNetworks(this.db, userId); }
  getNetwork(userId: string, networkId: string): NetworkProfile | null { return getNetwork(this.db, userId, networkId); }
  deleteNetwork(userId: string, networkId: string) { deleteNetwork(this.db, userId, networkId); }
  listChannels(userId: string, networkId?: string): ChannelState[] { return listChannels(this.db, userId, networkId); }
  listQueries(userId: string, networkId?: string): QueryBuffer[] { return listQueries(this.db, userId, networkId); }
  getChannel(userId: string, channelId: string): ChannelState | null { return getChannel(this.db, userId, channelId); }
  getQuery(userId: string, networkId: string, target: string): QueryBuffer | null { return getQuery(this.db, userId, networkId, target); }
  getChannelByName(userId: string, networkId: string, name: string) { return getChannelByName(this.db, userId, networkId, name); }
  markChannelRead(userId: string, channelId: string) { markChannelRead(this.db, userId, channelId); }
  deleteQuery(userId: string, networkId: string, target: string) { deleteQuery(this.db, userId, networkId, target); }
  deleteChannelByName(userId: string, networkId: string, channelName: string) { deleteChannelByName(this.db, userId, networkId, channelName); }
  setChannelUnread(userId: string, networkId: string, channelName: string, unread: number) { setChannelUnread(this.db, userId, networkId, channelName, unread); }
  updateChannelUsers(userId: string, networkId: string, channelName: string, users: string[]) { updateChannelUsers(this.db, userId, networkId, channelName, users); }
  updateChannelTopic(userId: string, networkId: string, channelName: string, topic: string) { updateChannelTopic(this.db, userId, networkId, channelName, topic); }
  getMessageById(userId: string, messageId: string) { return getMessageById(this.db, userId, messageId); }
  listMessages(userId: string, networkId: string, target: string, limit = 200) { return listMessages(this.db, userId, networkId, target, limit); }
  listRecentMessages(userId: string, limit = 200) { return listRecentMessages(this.db, userId, limit); }

  ensureDefaultNetworks(userId: string, username: string) {
    ensureDefaultNetworks(this.db, userId, username, (nextUserId, input) => this.upsertNetwork(nextUserId, input));
  }

  upsertNetwork(userId: string, input: NetworkInput): NetworkProfile {
    return upsertNetwork(this.db, userId, input);
  }

  upsertChannel(userId: string, input: ChannelInput): ChannelState {
    return upsertChannel(this.db, userId, input, (nextUserId, networkId, name) =>
      this.getChannelByName(nextUserId, networkId, name)
    );
  }

  upsertQuery(userId: string, networkId: string, target: string): QueryBuffer {
    return upsertQuery(this.db, userId, networkId, target, (nextUserId, nextNetworkId, nextTarget) =>
      this.getQuery(nextUserId, nextNetworkId, nextTarget)
    );
  }

  appendMessage(userId: string, input: MessageInput) {
    return appendMessage(this.db, userId, input, (nextUserId, messageId) => this.getMessageById(nextUserId, messageId));
  }

  snapshot(userId: string): AppSnapshot {
    const user = this.getUserById(userId);
    if (!user) {
      throw new Error('Unknown user');
    }
    this.ensureDefaultNetworks(userId, user.username);
    const networks = this.listNetworks(userId);
    const channels = this.listChannels(userId);
    const activeNetworkId = networks[0]?.id ?? null;
    const activeChannel = channels.find((channel) => channel.networkId === activeNetworkId);
    return {
      user,
      networks,
      channels,
      queries: this.listQueries(userId),
      messages: this.listRecentMessages(userId, historyWindowLimit),
      activeNetworkId,
      activeBuffer: activeChannel ? `${activeNetworkId}:${activeChannel.name}` : activeNetworkId ? `${activeNetworkId}:server` : '',
      bootstrapped: this.hasUsers(),
    };
  }
}
