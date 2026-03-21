import type { DatabaseSync } from 'node:sqlite';
import {
  type BufferState,
  type ChannelUserState,
} from '../shared/protocol.js';
import { initializeStorageDefaults, openStorageResources } from './storage-bootstrap.js';
import {
  StorageConversationsRepository,
} from './storage-conversations-repository.js';
import { StorageFriendsRepository } from './storage-friends-repository.js';
import { StorageNetworksRepository } from './storage-networks-repository.js';
import { createStorageSnapshot } from './storage-snapshot.js';
import type { BufferInput, ChannelInput, FriendInput, MessageInput, NetworkInput } from './storage-types.js';

export { type MessageInput, type NetworkInput };

export class Storage {
  private readonly db: DatabaseSync;
  private readonly secretBox;
  private closed = false;
  readonly networks: StorageNetworksRepository;
  readonly conversations: StorageConversationsRepository;
  readonly friends: StorageFriendsRepository;

  constructor(filePath?: string) {
    const resources = openStorageResources(filePath);
    this.db = resources.db;
    this.secretBox = resources.secretBox;
    initializeStorageDefaults(resources);
    this.networks = new StorageNetworksRepository(this.db, this.secretBox);
    this.conversations = new StorageConversationsRepository(this.db);
    this.friends = new StorageFriendsRepository(this.db);
  }

  listNetworks() {
    return this.networks.list();
  }

  getNetwork(networkId: string) {
    return this.networks.get(networkId);
  }

  getRuntimeNetwork(networkId: string) {
    return this.networks.getRuntime(networkId);
  }

  deleteNetwork(networkId: string) {
    this.networks.delete(networkId);
  }

  listChannels(networkId?: string) {
    return this.conversations.listChannels(networkId);
  }

  listBuffers(networkId?: string) {
    return this.conversations.listBuffers(networkId);
  }

  listFriends() {
    return this.friends.list();
  }

  getBuffer(bufferId: string) {
    return this.conversations.getBuffer(bufferId);
  }

  getBufferByTarget(networkId: string, target: string) {
    return this.conversations.getBufferByTarget(networkId, target);
  }

  getServerBuffer(networkId: string) {
    return this.conversations.getServerBuffer(networkId);
  }

  getChannel(channelId: string) {
    return this.conversations.getChannel(channelId);
  }

  getChannelByName(networkId: string, name: string) {
    return this.conversations.getChannelByName(networkId, name);
  }

  getFriend(friendId: string) {
    return this.friends.get(friendId);
  }

  markBufferRead(bufferId: string) {
    this.conversations.markBufferRead(bufferId);
  }

  removeBuffer(bufferId: string) {
    return this.conversations.removeBuffer(bufferId);
  }

  deleteChannelByName(networkId: string, channelName: string) {
    this.conversations.deleteChannelByName(networkId, channelName);
  }

  setBufferUnread(bufferId: string, unread: number) {
    this.conversations.setBufferUnread(bufferId, unread);
  }

  updateChannelUsers(networkId: string, channelName: string, users: ChannelUserState[]) {
    this.conversations.updateChannelUsers(networkId, channelName, users);
  }

  updateChannelTopic(networkId: string, channelName: string, topic: string) {
    this.conversations.updateChannelTopic(networkId, channelName, topic);
  }

  getMessageById(messageId: string) {
    return this.conversations.getMessageById(messageId);
  }

  listMessages(networkId: string, target: string, limit?: number) {
    return this.conversations.listMessages(networkId, target, limit);
  }

  listRecentMessages(limit = 200) { return this.conversations.listRecentMessages(limit); }

  upsertNetwork(input: NetworkInput) {
    return this.networks.upsert(input);
  }

  upsertChannel(input: ChannelInput) {
    return this.conversations.upsertChannel(input);
  }

  upsertBuffer(input: BufferInput) {
    return this.conversations.upsertBuffer(input);
  }

  upsertQuery(networkId: string, target: string) {
    return this.conversations.upsertQuery(networkId, target);
  }

  upsertFriend(input: FriendInput) {
    return this.friends.upsert(input);
  }

  removeFriend(friendId: string) {
    return this.friends.remove(friendId);
  }

  appendMessage(input: MessageInput) {
    return this.conversations.appendMessage(input);
  }

  snapshot() {
    return createStorageSnapshot(this);
  }

  close() {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.db.close();
  }
}
