import type { SqliteDb } from './storage-sqlite.js';
import type { ChannelUserState } from '../shared/protocol-chat.js';
import {
  appendMessage,
  deleteMessages,
  deleteMessagesByIdPrefixes,
  getMessageWindow,
  getMessageById,
  listAllMessages,
  listOpeningMessages,
  listMessagePage,
  listMessages,
  listRecentMessagesForBuffer,
  listRecentMessagesForBufferIds,
  listRecentMessages,
  searchMessagesByBufferId,
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
  setBufferNotes,
  setBufferUnread,
  updateChannelTopic,
  updateChannelUsers,
  upsertBuffer,
  upsertChannel,
} from './storage-buffers.js';
import { runInTransaction } from './storage-db.js';
import {
  listQueryNickAliases,
  recordObservedQueryNickChange,
  upsertQueryBuffer,
  upsertQueryBufferWithMergeResult,
} from './storage-query-aliases.js';
import type { BufferInput, ChannelInput, MessageInput } from './storage-types.js';
import type { NetworkUserIdentity } from '../shared/user-identity.js';

export class StorageConversationsRepository {
  constructor(private readonly db: SqliteDb) {}

  listBuffers(networkId?: string) {
    return listBuffers(this.db, networkId);
  }

  listChannels(networkId?: string) {
    return listChannels(this.db, networkId);
  }

  listQueryNickAliases(networkId?: string) {
    return listQueryNickAliases(this.db, networkId);
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

  setBufferNotes(bufferId: string, notes: string) {
    return setBufferNotes(this.db, bufferId, notes);
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

  listRecentMessagesForBufferIds(bufferIds: readonly string[], limit: number) {
    return listRecentMessagesForBufferIds(this.db, bufferIds, limit);
  }

  searchMessagesByBufferId(bufferId: string, query: string, limit: number) {
    return searchMessagesByBufferId(this.db, bufferId, query, limit);
  }

  getMessageWindow(messageId: string, before: number, after: number) {
    return getMessageWindow(this.db, messageId, before, after);
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
    if (input.kind === 'query') {
      return runInTransaction(this.db, () => upsertQueryBuffer(this.db, { ...input, kind: 'query' }));
    }
    return upsertBuffer(this.db, input);
  }

  upsertQuery(networkId: string, target: string, peerIdentity?: NetworkUserIdentity | null) {
    return this.upsertQueryWithMergeResult(networkId, target, peerIdentity).buffer;
  }

  upsertQueryWithMergeResult(networkId: string, target: string, peerIdentity?: NetworkUserIdentity | null) {
    return runInTransaction(this.db, () =>
      upsertQueryBufferWithMergeResult(this.db, {
        networkId,
        kind: 'query',
        target,
        peerIdentity,
        peerIdentitySource: 'manual',
      })
    );
  }

  recordObservedQueryNickChange(networkId: string, fromTarget: string, toTarget: string) {
    return runInTransaction(this.db, () =>
      recordObservedQueryNickChange(this.db, networkId, fromTarget, toTarget)
    );
  }

  appendMessage(input: MessageInput) {
    return appendMessage(this.db, input, (messageId) => this.getMessageById(messageId));
  }
}
