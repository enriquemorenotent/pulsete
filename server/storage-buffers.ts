import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { BufferState, ChannelState, ChannelUserState } from '../shared/protocol.js';
import { isSameIrcIdentifier } from '../shared/irc-identifiers.js';
import type { BufferInput, BufferRow, ChannelInput, ChannelRow } from './storage-types.js';
import { toBufferState, toChannelState } from './storage-utils.js';

const channelSelect = `
  SELECT
    buffers.id,
    buffers.networkId,
    buffers.target AS name,
    channel_details.topic,
    channel_details.users,
    channel_details.createdAt,
    channel_details.updatedAt
  FROM buffers
  JOIN channel_details ON channel_details.id = buffers.id
  WHERE buffers.kind = 'channel'
`;

export const listBuffers = (db: DatabaseSync, networkId?: string): BufferState[] => {
  const sql = networkId
    ? 'SELECT id, networkId, kind, target, unread, createdAt, updatedAt FROM buffers WHERE networkId = ? ORDER BY createdAt ASC'
    : 'SELECT id, networkId, kind, target, unread, createdAt, updatedAt FROM buffers ORDER BY createdAt ASC';
  const args = networkId ? [networkId] : [];
  return (db.prepare(sql).all(...args) as BufferRow[]).map(toBufferState);
};

export const getBuffer = (db: DatabaseSync, bufferId: string): BufferState | null => {
  const row = db.prepare('SELECT id, networkId, kind, target, unread, createdAt, updatedAt FROM buffers WHERE id = ?')
    .get(bufferId) as BufferRow | undefined;
  return row ? toBufferState(row) : null;
};

export const getBufferByTarget = (db: DatabaseSync, networkId: string, target: string): BufferState | null => {
  const row = db.prepare('SELECT id, networkId, kind, target, unread, createdAt, updatedAt FROM buffers WHERE networkId = ? AND target = ?')
    .get(networkId, target) as BufferRow | undefined;
  if (row) {
    return toBufferState(row);
  }
  return listBuffers(db, networkId).find((buffer) => isSameIrcIdentifier(buffer.target, target)) ?? null;
};

export const getServerBuffer = (db: DatabaseSync, networkId: string) =>
  getBufferByTarget(db, networkId, 'server');

export const upsertBuffer = (db: DatabaseSync, input: BufferInput) => {
  const existing =
    (input.id ? getBuffer(db, input.id) : null)
    ?? getBufferByTarget(db, input.networkId, input.target);
  const id = existing?.id ?? input.id ?? randomUUID();
  const now = Date.now();
  db.prepare(
    `INSERT INTO buffers
       (id, networkId, kind, target, unread, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(networkId, target) DO UPDATE SET
       kind = excluded.kind,
       unread = excluded.unread,
       updatedAt = excluded.updatedAt`
  ).run(
    id,
    input.networkId,
    input.kind,
    input.target,
    input.unread ?? existing?.unread ?? 0,
    existing ? existingIdCreatedAt(db, id) : now,
    now
  );
  return getBuffer(db, id)!;
};

export const removeBuffer = (db: DatabaseSync, bufferId: string) => {
  const existing = getBuffer(db, bufferId);
  if (!existing) {
    return null;
  }
  db.prepare('DELETE FROM buffers WHERE id = ?').run(bufferId);
  return existing;
};

export const markBufferRead = (db: DatabaseSync, bufferId: string) => {
  db.prepare('UPDATE buffers SET unread = 0, updatedAt = ? WHERE id = ?')
    .run(Date.now(), bufferId);
};

export const setBufferUnread = (db: DatabaseSync, bufferId: string, unread: number) => {
  db.prepare('UPDATE buffers SET unread = ?, updatedAt = ? WHERE id = ?')
    .run(unread, Date.now(), bufferId);
};

export const listChannels = (db: DatabaseSync, networkId?: string): ChannelState[] => {
  const sql = networkId
    ? `${channelSelect} AND buffers.networkId = ? ORDER BY buffers.createdAt ASC`
    : `${channelSelect} ORDER BY buffers.createdAt ASC`;
  const args = networkId ? [networkId] : [];
  return (db.prepare(sql).all(...args) as Array<ChannelRow & { networkId: string; name: string }>).map(toChannelState);
};

export const getChannel = (db: DatabaseSync, channelId: string): ChannelState | null => {
  const row = db.prepare(`${channelSelect} AND buffers.id = ?`)
    .get(channelId) as (ChannelRow & { networkId: string; name: string }) | undefined;
  return row ? toChannelState(row) : null;
};

export const getChannelByName = (db: DatabaseSync, networkId: string, name: string) => {
  const row = db.prepare(`${channelSelect} AND buffers.networkId = ? AND buffers.target = ?`)
    .get(networkId, name) as (ChannelRow & { networkId: string; name: string }) | undefined;
  if (row) {
    return toChannelState(row);
  }
  return listChannels(db, networkId).find((channel) => isSameIrcIdentifier(channel.name, name)) ?? null;
};

export const upsertChannel = (db: DatabaseSync, input: ChannelInput) => {
  const existing = getChannelByName(db, input.networkId, input.name);
  const buffer = upsertBuffer(db, {
    id: input.id ?? existing?.id,
    networkId: input.networkId,
    kind: 'channel',
    target: input.name,
    unread: input.unread,
  });
  const topic = input.topic ?? existing?.topic ?? '';
  const users = input.users ?? existing?.users ?? [];
  const now = Date.now();
  const createdAt = getChannelCreatedAt(db, buffer.id) ?? now;
  db.prepare(
    `INSERT INTO channel_details
       (id, topic, users, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       topic = excluded.topic,
       users = excluded.users,
       updatedAt = excluded.updatedAt`
  ).run(
    buffer.id,
    topic,
    JSON.stringify(users),
    createdAt,
    now
  );
  return getChannel(db, buffer.id)!;
};

export const deleteChannelByName = (db: DatabaseSync, networkId: string, channelName: string) => {
  const buffer = getBufferByTarget(db, networkId, channelName);
  if (buffer?.kind === 'channel') {
    removeBuffer(db, buffer.id);
  }
};

export const updateChannelUsers = (db: DatabaseSync, networkId: string, channelName: string, users: ChannelUserState[]) => {
  const channel = getChannelByName(db, networkId, channelName);
  if (!channel) {
    return;
  }
  db.prepare('UPDATE channel_details SET users = ?, updatedAt = ? WHERE id = ?')
    .run(JSON.stringify(users), Date.now(), channel.id);
};

export const updateChannelTopic = (db: DatabaseSync, networkId: string, channelName: string, topic: string) => {
  const channel = getChannelByName(db, networkId, channelName);
  if (!channel) {
    return;
  }
  db.prepare('UPDATE channel_details SET topic = ?, updatedAt = ? WHERE id = ?')
    .run(topic, Date.now(), channel.id);
};

const existingIdCreatedAt = (db: DatabaseSync, id: string) =>
  (db.prepare('SELECT createdAt FROM buffers WHERE id = ?').get(id) as { createdAt: number } | undefined)?.createdAt ?? Date.now();

const getChannelCreatedAt = (db: DatabaseSync, id: string) =>
  (db.prepare('SELECT createdAt FROM channel_details WHERE id = ?').get(id) as { createdAt: number } | undefined)?.createdAt ?? null;
