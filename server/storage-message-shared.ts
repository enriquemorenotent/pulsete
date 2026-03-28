import type { DatabaseSync } from 'node:sqlite';
import { isSameIrcIdentifier } from '../shared/irc-identifiers.js';
import type { MessageInput, MessagePage, MessageRow } from './storage-types.js';
import { toMessage } from './storage-utils.js';

export const emptyMessagePage: MessagePage = { messages: [], hasMore: false };
export const messageColumns = [
  'id',
  'networkId',
  'target',
  'nick',
  'speakerRole',
  'speakerNick',
  'attributionSource',
  'attributionConfidence',
  'importBatchId',
  'body',
  'kind',
  'self',
  'ts',
].join(', ');

export type MessageLookup = (messageId: string) => MessageInput | null;
export type MessageCursor = { networkId: string; rowid: number; target: string; ts: number };

export const listMatchingTargets = (db: DatabaseSync, networkId: string, target: string) =>
  (db.prepare('SELECT DISTINCT target FROM messages WHERE networkId = ?').all(networkId) as Array<{ target: string }>)
    .map((row) => row.target)
    .filter((candidate) => isSameIrcIdentifier(candidate, target));

export const getMessageCursor = (db: DatabaseSync, messageId: string) =>
  db.prepare('SELECT networkId, rowid, target, ts FROM messages WHERE id = ?').get(messageId) as MessageCursor | undefined;

export const buildIdPrefixWhereClause = (prefixes: string[]) => {
  const normalized = [...new Set(prefixes.filter(Boolean))];
  if (normalized.length === 0) {
    return null;
  }
  return {
    where: normalized.map(() => 'substr(id, 1, ?) = ?').join(' OR '),
    args: normalized.flatMap((prefix) => [prefix.length, prefix]),
  };
};

export const hydrateMessages = (_db: DatabaseSync, rows: MessageRow[]) => rows.map((row) => toMessage(row));
