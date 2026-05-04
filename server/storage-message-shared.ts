import type { SqliteDb } from './storage-sqlite.js';
import type { MessageInput, MessagePage, MessageRow } from './storage-types.js';
import type { ChatMessage } from '../shared/protocol-chat.js';
import { resolveMessageBufferId } from './storage-query-aliases.js';
import { toMessage } from './storage-utils.js';

export const emptyMessagePage: MessagePage = { messages: [], hasMore: false };

export const messageColumns = [
  'm.id',
  'm.bufferId',
  'b.networkId AS networkId',
  'b.target AS target',
  'm.nick',
  'm.senderIdentityKind',
  'm.senderIdentityValue',
  'm.speakerRole',
  'm.speakerNick',
  'm.attributionSource',
  'm.attributionConfidence',
  'm.importBatchId',
  'm.body',
  'm.kind',
  'm.self',
  'm.ts',
].join(', ');

export const messageJoin = 'FROM messages AS m JOIN buffers AS b ON b.id = m.bufferId';

export type MessageLookup = (messageId: string) => ChatMessage | null;
export type MessageCursor = { bufferId: string; rowid: number; ts: number };

export const getMessageBufferId = (
  db: SqliteDb,
  networkId: string,
  target: string,
  senderIdentity?: MessageInput['senderIdentity'],
) => resolveMessageBufferId(db, networkId, target, senderIdentity);

export const getMessageCursor = (db: SqliteDb, messageId: string) =>
  db.prepare('SELECT bufferId, rowid, ts FROM messages WHERE id = ?').get(messageId) as MessageCursor | undefined;

export const buildIdPrefixWhereClause = (prefixes: string[], column = 'id') => {
  const normalized = [...new Set(prefixes.filter(Boolean))];
  if (normalized.length === 0) {
    return null;
  }
  return {
    where: normalized.map(() => `substr(${column}, 1, ?) = ?`).join(' OR '),
    args: normalized.flatMap((prefix) => [prefix.length, prefix]),
  };
};

export const hydrateMessages = (_db: SqliteDb, rows: MessageRow[]) => rows.map((row) => toMessage(row));
