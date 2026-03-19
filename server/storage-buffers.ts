import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { ChannelState, QueryBuffer } from '../shared/protocol.js';
import type { ChannelInput, ChannelRow, QueryRow } from './storage-types.js';
import { toChannelState, toQueryBuffer } from './storage-utils.js';

export const listChannels = (db: DatabaseSync, networkId?: string): ChannelState[] => {
  const sql = networkId
    ? 'SELECT id, networkId, name, topic, unread, users FROM channels WHERE networkId = ? ORDER BY createdAt ASC'
    : 'SELECT id, networkId, name, topic, unread, users FROM channels ORDER BY createdAt ASC';
  const args = networkId ? [networkId] : [];
  return (db.prepare(sql).all(...args) as ChannelRow[]).map(toChannelState);
};

export const listQueries = (db: DatabaseSync, networkId?: string): QueryBuffer[] => {
  const sql = networkId
    ? 'SELECT id, networkId, target FROM queries WHERE networkId = ? ORDER BY createdAt ASC'
    : 'SELECT id, networkId, target FROM queries ORDER BY createdAt ASC';
  const args = networkId ? [networkId] : [];
  return (db.prepare(sql).all(...args) as QueryRow[]).map(toQueryBuffer);
};

export const getChannel = (db: DatabaseSync, channelId: string): ChannelState | null => {
  const sql = 'SELECT id, networkId, name, topic, unread, users FROM channels WHERE id = ?';
  const row = db.prepare(sql).get(channelId) as ChannelRow | undefined;
  return row ? toChannelState(row) : null;
};

export const getQuery = (db: DatabaseSync, networkId: string, target: string): QueryBuffer | null => {
  const sql = 'SELECT id, networkId, target FROM queries WHERE networkId = ? AND target = ?';
  const row = db.prepare(sql).get(networkId, target) as QueryRow | undefined;
  return row ? toQueryBuffer(row) : null;
};

export const upsertChannel = (db: DatabaseSync, input: ChannelInput, lookup: ChannelLookup) => {
  const existing = lookup(input.networkId, input.name);
  const id = existing?.id ?? input.id ?? randomUUID();
  const topic = input.topic ?? existing?.topic ?? '';
  const unread = input.unread ?? existing?.unread ?? 0;
  const users = input.users ?? existing?.users ?? [];
  const now = Date.now();
  db.prepare(
    `INSERT INTO channels
       (id, networkId, name, topic, unread, users, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(networkId, name) DO UPDATE SET
       topic = excluded.topic,
       unread = excluded.unread,
       users = excluded.users,
       updatedAt = excluded.updatedAt`
  ).run(
    id,
    input.networkId,
    input.name,
    topic,
    unread,
    JSON.stringify(users),
    now,
    now
  );
  return lookup(input.networkId, input.name)!;
};

export const getChannelByName = (db: DatabaseSync, networkId: string, name: string) => {
  const sql = 'SELECT id, networkId, name, topic, unread, users FROM channels WHERE networkId = ? AND name = ?';
  const row = db.prepare(sql).get(networkId, name) as ChannelRow | undefined;
  return row ? toChannelState(row) : null;
};

export const markChannelRead = (db: DatabaseSync, channelId: string) => {
  db.prepare('UPDATE channels SET unread = 0, updatedAt = ? WHERE id = ?')
    .run(Date.now(), channelId);
};

export const upsertQuery = (db: DatabaseSync, networkId: string, target: string, lookup: QueryLookup) => {
  const id = lookup(networkId, target)?.id ?? randomUUID();
  const now = Date.now();
  db.prepare(
    `INSERT INTO queries
       (id, networkId, target, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(networkId, target) DO UPDATE SET
       updatedAt = excluded.updatedAt`
  ).run(id, networkId, target, now, now);
  return lookup(networkId, target)!;
};

export const deleteQuery = (db: DatabaseSync, networkId: string, target: string) => {
  db.prepare('DELETE FROM queries WHERE networkId = ? AND target = ?').run(networkId, target);
};

export const deleteChannelByName = (db: DatabaseSync, networkId: string, channelName: string) => {
  db.prepare('DELETE FROM channels WHERE networkId = ? AND name = ?').run(networkId, channelName);
};

export const setChannelUnread = (db: DatabaseSync, networkId: string, channelName: string, unread: number) => {
  db.prepare('UPDATE channels SET unread = ?, updatedAt = ? WHERE networkId = ? AND name = ?')
    .run(unread, Date.now(), networkId, channelName);
};

export const updateChannelUsers = (db: DatabaseSync, networkId: string, channelName: string, users: string[]) => {
  db.prepare('UPDATE channels SET users = ?, updatedAt = ? WHERE networkId = ? AND name = ?')
    .run(JSON.stringify(users), Date.now(), networkId, channelName);
};

export const updateChannelTopic = (db: DatabaseSync, networkId: string, channelName: string, topic: string) => {
  db.prepare('UPDATE channels SET topic = ?, updatedAt = ? WHERE networkId = ? AND name = ?')
    .run(topic, Date.now(), networkId, channelName);
};

type ChannelLookup = (networkId: string, name: string) => ChannelState | null;
type QueryLookup = (networkId: string, target: string) => QueryBuffer | null;
