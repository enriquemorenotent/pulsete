import type { DatabaseSync } from 'node:sqlite';
import type { BufferState, ChannelUserState } from '../shared/protocol.js';
import {
  appendMessage,
  createHistoryImportBatch,
  deleteMessages,
  deleteMessagesByIdPrefixes,
  getHistoryImportBatch,
  getMessageWindow,
  getMessageById,
  listAllMessages,
  listOpeningMessages,
  listMessagePage,
  listMessages,
  listRecentMessagesForBuffer,
  listRecentMessages,
  repairQueryMessageAttributions,
  searchMessages,
} from './storage-messages.js';
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
import { runInTransaction } from './storage-db.js';
import type { BufferInput, ChannelInput, HistoryImportBatchInput, MessageInput } from './storage-types.js';

export class StorageConversationsRepository {
  constructor(private readonly db: DatabaseSync) {}

  listBuffers(networkId?: string) {
    return listBuffers(this.db, networkId);
  }

  listChannels(networkId?: string) {
    return listChannels(this.db, networkId);
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

  listMessagePage(networkId: string, target: string, limit: number, beforeMessageId?: string) {
    return listMessagePage(this.db, networkId, target, limit, beforeMessageId);
  }

  listAllMessages(networkId: string, target: string) {
    return listAllMessages(this.db, networkId, target);
  }

  listOpeningMessages(networkId: string, target: string, limit: number) {
    return listOpeningMessages(this.db, networkId, target, limit);
  }

  listRecentMessagesForBuffer(networkId: string, target: string, limit: number) {
    return listRecentMessagesForBuffer(this.db, networkId, target, limit);
  }

  getMessageWindow(messageId: string, before: number, after: number) {
    return getMessageWindow(this.db, messageId, before, after);
  }

  searchMessages(networkId: string, target: string, query: string, limit: number) {
    return searchMessages(this.db, networkId, target, query, limit);
  }

  listRecentMessages(limit = 200) {
    return listRecentMessages(this.db, limit);
  }

  deleteMessagesByIdPrefixes(prefixes: string[]) {
    return runInTransaction(this.db, () => deleteMessagesByIdPrefixes(this.db, prefixes));
  }

  deleteMessages(networkId: string, target: string) {
    return runInTransaction(this.db, () => deleteMessages(this.db, networkId, target));
  }

  upsertChannel(input: ChannelInput) {
    return runInTransaction(this.db, () => upsertChannel(this.db, input));
  }

  upsertBuffer(input: BufferInput) {
    return upsertBuffer(this.db, input);
  }

  upsertQuery(networkId: string, target: string) {
    return upsertBuffer(this.db, { networkId, kind: 'query', target });
  }

  appendMessage(input: MessageInput) {
    return appendMessage(this.db, input, (messageId) => this.getMessageById(messageId));
  }

  repairQueryMessageAttributions(input: {
    bufferId: string;
    networkId: string;
    target: string;
    nick: string;
    altNicks: string[];
    selfNickAliases: string[];
  }) {
    return runInTransaction(this.db, () => repairQueryMessageAttributions(this.db, input));
  }

  createHistoryImportBatch(input: HistoryImportBatchInput) {
    return runInTransaction(this.db, () => createHistoryImportBatch(this.db, input));
  }

  getHistoryImportBatch(batchId: string) {
    return getHistoryImportBatch(this.db, batchId);
  }
}
