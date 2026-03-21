import type { DatabaseSync } from 'node:sqlite';
import { isConnectionInstance } from '../shared/network-model.js';
import {
  historyWindowLimit,
  type BufferState,
  type ChannelUserState,
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
import type { ChannelInput, FriendInput, MessageInput, NetworkInput } from './storage-types.js';

export { type MessageInput, type NetworkInput };

export class Storage {
  private readonly db: DatabaseSync;
  private readonly secretBox;
  private closed = false;

  constructor(filePath?: string) {
    this.db = createDatabase(filePath);
    this.secretBox = createSecretBox(filePath, { createIfMissing: !hasEncryptedNetworkPasswords(this.db) });
    migrateLegacyNetworkPasswords(this.db, this.secretBox);
    this.initializeDefaults();
  }

  listNetworks() {
    return listNetworks(this.db);
  }

  getNetwork(networkId: string) {
    return getNetwork(this.db, networkId);
  }

  getRuntimeNetwork(networkId: string) {
    return getRuntimeNetwork(this.db, networkId, this.secretBox);
  }

  deleteNetwork(networkId: string) {
    deleteNetwork(this.db, networkId);
  }

  listChannels(networkId?: string) {
    return listChannels(this.db, networkId);
  }

  listBuffers(networkId?: string) {
    return listBuffers(this.db, networkId);
  }

  listFriends() {
    return listFriends(this.db);
  }

  getBuffer(bufferId: string) {
    return getBuffer(this.db, bufferId);
  }

  getBufferByTarget(networkId: string, target: string) {
    return getBufferByTarget(this.db, networkId, target);
  }

  getServerBuffer(networkId: string) {
    return getServerBuffer(this.db, networkId);
  }

  getChannel(channelId: string) {
    return getChannel(this.db, channelId);
  }

  getChannelByName(networkId: string, name: string) {
    return getChannelByName(this.db, networkId, name);
  }

  getFriend(friendId: string) {
    return getFriend(this.db, friendId);
  }

  markBufferRead(bufferId: string) {
    markBufferRead(this.db, bufferId);
  }

  removeBuffer(bufferId: string) {
    return removeBuffer(this.db, bufferId);
  }

  deleteChannelByName(networkId: string, channelName: string) {
    deleteChannelByName(this.db, networkId, channelName);
  }

  setBufferUnread(bufferId: string, unread: number) {
    setBufferUnread(this.db, bufferId, unread);
  }

  updateChannelUsers(networkId: string, channelName: string, users: ChannelUserState[]) {
    updateChannelUsers(this.db, networkId, channelName, users);
  }

  updateChannelTopic(networkId: string, channelName: string, topic: string) {
    updateChannelTopic(this.db, networkId, channelName, topic);
  }

  getMessageById(messageId: string) {
    return getMessageById(this.db, messageId);
  }

  listMessages(networkId: string, target: string, limit?: number) {
    return listMessages(this.db, networkId, target, limit);
  }

  listRecentMessages(limit = 200) { return listRecentMessages(this.db, limit); }

  ensureDefaultNetworks() {
    ensureDefaultNetworks(this.db, (input) => this.upsertNetwork(input));
  }

  upsertNetwork(input: NetworkInput) {
    const network = upsertNetwork(this.db, input, this.secretBox);
    if (isConnectionInstance(network)) {
      this.ensureServerBuffer(network.id);
    }
    return network;
  }

  upsertChannel(input: ChannelInput) {
    return upsertChannel(this.db, input);
  }

  upsertBuffer(input: { id?: string; networkId: string; kind: BufferState['kind']; target: string; unread?: number }) {
    return upsertBuffer(this.db, input);
  }

  upsertQuery(networkId: string, target: string) {
    return upsertBuffer(this.db, { networkId, kind: 'query', target });
  }

  upsertFriend(input: FriendInput) {
    return upsertFriend(this.db, input);
  }

  removeFriend(friendId: string) {
    return removeFriend(this.db, friendId);
  }

  appendMessage(input: MessageInput) {
    return appendMessage(this.db, input, (messageId) => this.getMessageById(messageId));
  }

  snapshot() {
    const networks = this.listNetworks();
    return {
      networks,
      friends: this.listFriends(),
      friendPresence: {},
      buffers: this.listBuffers(),
      channels: this.listChannels(),
      pendingChannels: [],
      messages: this.listRecentMessages(historyWindowLimit),
      networkStates: {},
    };
  }

  close() {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.db.close();
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
    for (const network of this.listNetworks().filter(isConnectionInstance)) {
      this.ensureServerBuffer(network.id);
    }
  }

  private initializeDefaults() {
    this.ensureDefaultNetworks();
    this.ensureServerBuffers();
  }
}
