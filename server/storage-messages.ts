import type { DatabaseSync } from 'node:sqlite';
import { isSameIrcIdentifier } from '../shared/irc-identifiers.js';
import type { MessageInput, MessageRow } from './storage-types.js';
import { toMessage } from './storage-utils.js';

export const appendMessage = (db: DatabaseSync, input: MessageInput, lookup: MessageLookup) => {
  db.prepare(
    `INSERT INTO messages
       (id, networkId, target, nick, body, kind, self, ts)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    input.id,
    input.networkId,
    input.target,
    input.nick,
    input.body,
    input.kind,
    input.self ? 1 : 0,
    input.ts
  );
  return lookup(input.id)!;
};

export const getMessageById = (db: DatabaseSync, messageId: string) => {
  const sql = 'SELECT id, networkId, target, nick, body, kind, self, ts FROM messages WHERE id = ?';
  const row = db.prepare(sql).get(messageId) as MessageRow | undefined;
  return row ? toMessage(row) : null;
};

export const listMessages = (db: DatabaseSync, networkId: string, target: string, limit = 200) => {
  const matchingTargets = listMatchingTargets(db, networkId, target);
  if (matchingTargets.length === 0) {
    return [];
  }
  return selectMessages(db, networkId, matchingTargets, limit);
};

export const listAllMessages = (db: DatabaseSync, networkId: string, target: string) => {
  const matchingTargets = listMatchingTargets(db, networkId, target);
  if (matchingTargets.length === 0) {
    return [];
  }
  return selectMessages(db, networkId, matchingTargets);
};

export const deleteMessages = (db: DatabaseSync, networkId: string, target: string) => {
  const matchingTargets = listMatchingTargets(db, networkId, target);
  if (matchingTargets.length === 0) {
    return [];
  }
  const placeholders = matchingTargets.map(() => '?').join(', ');
  const sql = `
    SELECT id, networkId, target, nick, body, kind, self, ts
    FROM messages
    WHERE networkId = ? AND target IN (${placeholders})
    ORDER BY ts ASC, rowid ASC
  `;
  const rows = db.prepare(sql).all(networkId, ...matchingTargets) as MessageRow[];
  if (rows.length === 0) {
    return [];
  }
  db.prepare(`DELETE FROM messages WHERE networkId = ? AND target IN (${placeholders})`).run(networkId, ...matchingTargets);
  return rows.map(toMessage);
};

export const listRecentMessages = (db: DatabaseSync, limit = 200) => {
  const sql = 'SELECT id, networkId, target, nick, body, kind, self, ts FROM messages ORDER BY ts DESC, rowid DESC LIMIT ?';
  const rows = db.prepare(sql).all(limit) as MessageRow[];
  return rows.reverse().map(toMessage);
};

export const deleteMessagesByIdPrefixes = (db: DatabaseSync, prefixes: string[]) => {
  const clauses = buildIdPrefixWhereClause(prefixes);
  if (!clauses) {
    return [];
  }
  const sql = `
    SELECT id, networkId, target, nick, body, kind, self, ts
    FROM messages
    WHERE ${clauses.where}
    ORDER BY ts ASC, rowid ASC
  `;
  const rows = db.prepare(sql).all(...clauses.args) as MessageRow[];
  if (rows.length === 0) {
    return [];
  }
  db.prepare(`DELETE FROM messages WHERE ${clauses.where}`).run(...clauses.args);
  return rows.map(toMessage);
};

type MessageLookup = (messageId: string) => MessageInput | null;

const listMatchingTargets = (db: DatabaseSync, networkId: string, target: string) => {
  const rows = db.prepare('SELECT DISTINCT target FROM messages WHERE networkId = ?').all(networkId) as Array<{ target: string }>;
  return rows
    .map((row) => row.target)
    .filter((candidate) => isSameIrcIdentifier(candidate, target));
};

const selectMessages = (
  db: DatabaseSync,
  networkId: string,
  matchingTargets: string[],
  limit?: number,
) => {
  const placeholders = matchingTargets.map(() => '?').join(', ');
  const limitClause = typeof limit === 'number' ? '\n    LIMIT ?' : '';
  const sql = `
    SELECT id, networkId, target, nick, body, kind, self, ts
    FROM messages
    WHERE networkId = ? AND target IN (${placeholders})
    ORDER BY ts DESC, rowid DESC${limitClause}
  `;
  const args = typeof limit === 'number'
    ? [networkId, ...matchingTargets, limit]
    : [networkId, ...matchingTargets];
  const rows = db.prepare(sql).all(...args) as MessageRow[];
  return rows.reverse().map(toMessage);
};

const buildIdPrefixWhereClause = (prefixes: string[]) => {
  const normalized = [...new Set(prefixes.filter(Boolean))];
  if (normalized.length === 0) {
    return null;
  }
  return {
    where: normalized.map(() => 'substr(id, 1, ?) = ?').join(' OR '),
    args: normalized.flatMap((prefix) => [prefix.length, prefix]),
  };
};
