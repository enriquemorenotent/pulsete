import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { ChannelState, QueryBuffer } from '../shared/protocol.js';
import type { ChannelInput, ChannelRow, QueryRow } from './storage-types.js';
import { toChannelState, toQueryBuffer } from './storage-utils.js';

export const listChannels = (db: DatabaseSync, userId: string, networkId?: string): ChannelState[] => {
  const sql = networkId
    ? 'SELECT id, networkId, name, topic, unread, users FROM channels WHERE userId = ? AND networkId = ? ORDER BY createdAt ASC'
    : 'SELECT id, networkId, name, topic, unread, users FROM channels WHERE userId = ? ORDER BY createdAt ASC';
  const args = networkId ? [userId, networkId] : [userId];
  return (db.prepare(sql).all(...args) as ChannelRow[]).map(toChannelState);
};

export const listQueries = (db: DatabaseSync, userId: string, networkId?: string): QueryBuffer[] => {
  const sql = networkId
    ? 'SELECT id, networkId, target FROM queries WHERE userId = ? AND networkId = ? ORDER BY createdAt ASC'
    : 'SELECT id, networkId, target FROM queries WHERE userId = ? ORDER BY createdAt ASC';
  const args = networkId ? [userId, networkId] : [userId];
  return (db.prepare(sql).all(...args) as QueryRow[]).map(toQueryBuffer);
};

export const getChannel = (db: DatabaseSync, userId: string, channelId: string): ChannelState | null => {
  const sql = 'SELECT id, networkId, name, topic, unread, users FROM channels WHERE userId = ? AND id = ?';
  const row = db.prepare(sql).get(userId, channelId) as ChannelRow | undefined;
  return row ? toChannelState(row) : null;
};

export const getQuery = (db: DatabaseSync, userId: string, networkId: string, target: string): QueryBuffer | null => {
  const sql = 'SELECT id, networkId, target FROM queries WHERE userId = ? AND networkId = ? AND target = ?';
  const row = db.prepare(sql).get(userId, networkId, target) as QueryRow | undefined;
  return row ? toQueryBuffer(row) : null;
};

export const upsertChannel = (db: DatabaseSync, userId: string, input: ChannelInput, lookup: ChannelLookup) => {
  const id = input.id ?? randomUUID();
  const now = Date.now();
  db.prepare(
    `INSERT INTO channels
       (id, userId, networkId, name, topic, unread, users, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(userId, networkId, name) DO UPDATE SET
       topic = excluded.topic,
       unread = excluded.unread,
       users = excluded.users,
       updatedAt = excluded.updatedAt`
  ).run(
    id,
    userId,
    input.networkId,
    input.name,
    input.topic ?? '',
    input.unread ?? 0,
    JSON.stringify(input.users ?? []),
    now,
    now
  );
  return lookup(userId, input.networkId, input.name)!;
};

export const getChannelByName = (db: DatabaseSync, userId: string, networkId: string, name: string) => {
  const sql = 'SELECT id, networkId, name, topic, unread, users FROM channels WHERE userId = ? AND networkId = ? AND name = ?';
  const row = db.prepare(sql).get(userId, networkId, name) as ChannelRow | undefined;
  return row ? toChannelState(row) : null;
};

export const markChannelRead = (db: DatabaseSync, userId: string, channelId: string) => {
  db.prepare('UPDATE channels SET unread = 0, updatedAt = ? WHERE userId = ? AND id = ?')
    .run(Date.now(), userId, channelId);
};

export const upsertQuery = (db: DatabaseSync, userId: string, networkId: string, target: string, lookup: QueryLookup) => {
  const id = lookup(userId, networkId, target)?.id ?? randomUUID();
  const now = Date.now();
  db.prepare(
    `INSERT INTO queries
       (id, userId, networkId, target, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(userId, networkId, target) DO UPDATE SET
       updatedAt = excluded.updatedAt`
  ).run(id, userId, networkId, target, now, now);
  return lookup(userId, networkId, target)!;
};

export const deleteQuery = (db: DatabaseSync, userId: string, networkId: string, target: string) => {
  db.prepare('DELETE FROM queries WHERE userId = ? AND networkId = ? AND target = ?').run(userId, networkId, target);
};

export const deleteChannelByName = (db: DatabaseSync, userId: string, networkId: string, channelName: string) => {
  db.prepare('DELETE FROM channels WHERE userId = ? AND networkId = ? AND name = ?').run(userId, networkId, channelName);
};

export const setChannelUnread = (db: DatabaseSync, userId: string, networkId: string, channelName: string, unread: number) => {
  db.prepare('UPDATE channels SET unread = ?, updatedAt = ? WHERE userId = ? AND networkId = ? AND name = ?')
    .run(unread, Date.now(), userId, networkId, channelName);
};

export const updateChannelUsers = (db: DatabaseSync, userId: string, networkId: string, channelName: string, users: string[]) => {
  db.prepare('UPDATE channels SET users = ?, updatedAt = ? WHERE userId = ? AND networkId = ? AND name = ?')
    .run(JSON.stringify(users), Date.now(), userId, networkId, channelName);
};

export const updateChannelTopic = (db: DatabaseSync, userId: string, networkId: string, channelName: string, topic: string) => {
  db.prepare('UPDATE channels SET topic = ?, updatedAt = ? WHERE userId = ? AND networkId = ? AND name = ?')
    .run(topic, Date.now(), userId, networkId, channelName);
};

type ChannelLookup = (userId: string, networkId: string, name: string) => ChannelState | null;
type QueryLookup = (userId: string, networkId: string, target: string) => QueryBuffer | null;
