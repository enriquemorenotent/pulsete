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
  repairBufferMessageAttributions,
  searchMessages,
} from './storage-messages.js';
import {
  deleteBuffer,
  deleteChannelByName,
  getBuffer,
  getBufferByTarget,
  getChannel,
  getChannelByName,
  getStoredBufferByTarget,
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

  markBufferRead(bufferId: string, input: { lastReadTs: number | null; lastReadMessageId: string | null }) {
    markBufferRead(this.db, bufferId, input);
  }

  setBufferUnread(bufferId: string, unread: number, priorityUnread = 0) {
    setBufferUnread(this.db, bufferId, unread, priorityUnread);
  }

  removeBuffer(bufferId: string) {
    return removeBuffer(this.db, bufferId);
  }

  deleteChannelByName(networkId: string, channelName: string) {
    deleteChannelByName(this.db, networkId, channelName);
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

  renameQuery(networkId: string, fromTarget: string, toTarget: string) {
    return runInTransaction(this.db, () => renameQuery(this.db, networkId, fromTarget, toTarget));
  }

  appendMessage(input: MessageInput) {
    return appendMessage(this.db, input, (messageId) => this.getMessageById(messageId));
  }

  repairBufferMessageAttributions(input: {
    bufferKind: 'channel' | 'query';
    networkId: string;
    target: string;
    nick: string;
    altNicks: string[];
    selfNickAliases: string[];
  }) {
    return runInTransaction(this.db, () => repairBufferMessageAttributions(this.db, input));
  }

  createHistoryImportBatch(input: HistoryImportBatchInput) {
    return runInTransaction(this.db, () => createHistoryImportBatch(this.db, input));
  }

  getHistoryImportBatch(batchId: string) {
    return getHistoryImportBatch(this.db, batchId);
  }
}

const renameQuery = (db: DatabaseSync, networkId: string, fromTarget: string, toTarget: string) => {
  const source = getStoredBufferByTarget(db, networkId, fromTarget);
  if (source?.kind !== 'query') {
    return null;
  }

  const destination = getStoredBufferByTarget(db, networkId, toTarget);
  const mergedBuffer = destination?.kind === 'query' && destination.id !== source.id ? destination : null;
  if (!mergedBuffer) {
    return {
      buffer: upsertBuffer(db, {
        ...source,
        target: toTarget,
        isOpen: true,
      }),
      removedBufferId: null,
    };
  }

  db.prepare('UPDATE messages SET bufferId = ? WHERE bufferId = ?').run(source.id, mergedBuffer.id);
  db.prepare('UPDATE history_import_batches SET bufferId = ? WHERE bufferId = ?').run(source.id, mergedBuffer.id);
  deleteBuffer(db, mergedBuffer.id);

  return {
    buffer: upsertBuffer(db, {
      ...source,
      target: toTarget,
      isOpen: true,
      unread: source.unread + mergedBuffer.unread,
      priorityUnread: source.priorityUnread + mergedBuffer.priorityUnread,
      ...pickLatestReadState(source, mergedBuffer),
      selfNickAliases: mergeNickAliases(source.selfNickAliases ?? [], mergedBuffer.selfNickAliases ?? []),
    }),
    removedBufferId: mergedBuffer.id,
  };
};

const mergeNickAliases = (left: string[], right: string[]) => [...new Set([...left, ...right])];

const pickLatestReadState = (
  source: BufferState,
  merged: BufferState | null,
) => {
  if (!merged || merged.lastReadTs == null) {
    return {
      lastReadTs: source.lastReadTs,
      lastReadMessageId: source.lastReadMessageId,
    };
  }
  if (source.lastReadTs == null || merged.lastReadTs > source.lastReadTs) {
    return {
      lastReadTs: merged.lastReadTs,
      lastReadMessageId: merged.lastReadMessageId,
    };
  }
  return {
    lastReadTs: source.lastReadTs,
    lastReadMessageId: source.lastReadMessageId,
  };
};
