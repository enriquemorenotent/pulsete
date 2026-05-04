import { randomUUID } from 'node:crypto';
import type { SqliteDb } from './storage-sqlite.js';
import type { BufferState, ChannelState, ChannelUserState } from '../shared/protocol-chat.js';
import { normalizeIrcIdentifier } from '../shared/irc-identifiers.js';
import { listBufferSelfNickAliases, replaceBufferSelfNickAliases } from './storage-owned-lists.js';
import { getPrimaryQueryPeerIdentity } from './storage-query-identities.js';
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

const bufferColumns =
  'id, networkId, kind, target, notes, isOpen, unread, priorityUnread, lastReadTs, lastReadMessageId, createdAt, updatedAt';

export const listBuffers = (db: SqliteDb, networkId?: string): BufferState[] => {
  const sql = networkId
    ? `SELECT ${bufferColumns} FROM buffers WHERE networkId = ? AND isOpen = 1 ORDER BY createdAt ASC`
    : `SELECT ${bufferColumns} FROM buffers WHERE isOpen = 1 ORDER BY createdAt ASC`;
  const args = networkId ? [networkId] : [];
  return (db.prepare(sql).all(...args) as BufferRow[]).map((row) =>
    toBufferState(row, listBufferSelfNickAliases(db, row.id), getPrimaryQueryPeerIdentity(db, row.id))
  );
};

export const getBuffer = (db: SqliteDb, bufferId: string): BufferState | null => {
  const row = db.prepare(`SELECT ${bufferColumns} FROM buffers WHERE id = ?`)
    .get(bufferId) as BufferRow | undefined;
  return row ? toBufferState(row, listBufferSelfNickAliases(db, row.id), getPrimaryQueryPeerIdentity(db, row.id)) : null;
};

export const getStoredBufferByTarget = (db: SqliteDb, networkId: string, target: string): BufferState | null => {
  const row = db.prepare(
    `SELECT ${bufferColumns} FROM buffers WHERE networkId = ? AND targetKey = ?`
  ).get(networkId, normalizeIrcIdentifier(target)) as BufferRow | undefined;
  return row ? toBufferState(row, listBufferSelfNickAliases(db, row.id), getPrimaryQueryPeerIdentity(db, row.id)) : null;
};

export const getBufferByTarget = (db: SqliteDb, networkId: string, target: string): BufferState | null => {
  const buffer = getStoredBufferByTarget(db, networkId, target);
  const row = buffer ? (db.prepare('SELECT isOpen FROM buffers WHERE id = ?').get(buffer.id) as { isOpen: number } | undefined) : null;
  return row?.isOpen ? buffer : null;
};

export const getServerBuffer = (db: SqliteDb, networkId: string) =>
  getStoredBufferByTarget(db, networkId, 'server');

export const upsertBuffer = (db: SqliteDb, input: BufferInput) => {
  const existing =
    (input.id ? getBuffer(db, input.id) : null)
    ?? getStoredBufferByTarget(db, input.networkId, input.target);
  const now = Date.now();
  const isOpen = input.isOpen ?? true;
  if (existing) {
    db.prepare(
      `UPDATE buffers
       SET networkId = ?, kind = ?, target = ?, targetKey = ?, notes = ?, isOpen = ?, unread = ?, priorityUnread = ?, lastReadTs = ?, lastReadMessageId = ?, updatedAt = ?
       WHERE id = ?`
    ).run(
      input.networkId,
      input.kind,
      input.target,
      normalizeIrcIdentifier(input.target),
      input.notes ?? existing.notes ?? '',
      isOpen ? 1 : 0,
      input.unread ?? existing.unread ?? 0,
      input.priorityUnread ?? existing.priorityUnread ?? 0,
      input.lastReadTs ?? existing.lastReadTs ?? null,
      input.lastReadMessageId ?? existing.lastReadMessageId ?? null,
      now,
      existing.id
    );
    replaceBufferSelfNickAliases(db, existing.id, input.selfNickAliases ?? existing.selfNickAliases ?? []);
    return getBuffer(db, existing.id)!;
  }

  const id = input.id ?? randomUUID();
  db.prepare(
    `INSERT INTO buffers
       (id, networkId, kind, target, targetKey, notes, isOpen, unread, priorityUnread, lastReadTs, lastReadMessageId, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.networkId,
    input.kind,
    input.target,
    normalizeIrcIdentifier(input.target),
    input.notes ?? '',
    isOpen ? 1 : 0,
    input.unread ?? 0,
    input.priorityUnread ?? 0,
    input.lastReadTs ?? null,
    input.lastReadMessageId ?? null,
    now,
    now
  );
  replaceBufferSelfNickAliases(db, id, input.selfNickAliases ?? []);
  return getBuffer(db, id)!;
};

export const setBufferNotes = (db: SqliteDb, bufferId: string, notes: string) => {
  const existing = getBuffer(db, bufferId);
  if (!existing) {
    return null;
  }
  db.prepare('UPDATE buffers SET notes = ?, updatedAt = ? WHERE id = ?')
    .run(notes, Date.now(), bufferId);
  return getBuffer(db, bufferId)!;
};

export const removeBuffer = (db: SqliteDb, bufferId: string) => {
  const existing = getBuffer(db, bufferId);
  if (!existing) {
    return null;
  }
  if (existing.kind === 'server') {
    return existing;
  }
  db.prepare('UPDATE buffers SET isOpen = 0, updatedAt = ? WHERE id = ?').run(Date.now(), bufferId);
  return existing;
};

export const deleteBuffer = (db: SqliteDb, bufferId: string) => {
  const existing = getBuffer(db, bufferId);
  if (!existing) {
    return null;
  }
  db.prepare('DELETE FROM buffers WHERE id = ?').run(bufferId);
  return existing;
};

export const markBufferRead = (
  db: SqliteDb,
  bufferId: string,
  input: { lastReadTs: number | null; lastReadMessageId: string | null },
) => {
  db.prepare(
    'UPDATE buffers SET unread = 0, priorityUnread = 0, lastReadTs = ?, lastReadMessageId = ?, updatedAt = ? WHERE id = ?'
  ).run(input.lastReadTs, input.lastReadMessageId, Date.now(), bufferId);
};

export const setBufferUnread = (
  db: SqliteDb,
  bufferId: string,
  unread: number,
  priorityUnread = 0,
) => {
  db.prepare(
    'UPDATE buffers SET unread = ?, priorityUnread = ?, updatedAt = ? WHERE id = ?'
  ).run(unread, priorityUnread, Date.now(), bufferId);
};

export const listChannels = (db: SqliteDb, networkId?: string): ChannelState[] => {
  const sql = networkId
    ? `${channelSelect} AND buffers.isOpen = 1 AND buffers.networkId = ? ORDER BY buffers.createdAt ASC`
    : `${channelSelect} AND buffers.isOpen = 1 ORDER BY buffers.createdAt ASC`;
  const args = networkId ? [networkId] : [];
  return (db.prepare(sql).all(...args) as Array<ChannelRow & { networkId: string; name: string }>).map(toChannelState);
};

export const getChannel = (db: SqliteDb, channelId: string): ChannelState | null => {
  const row = db.prepare(`${channelSelect} AND buffers.id = ?`)
    .get(channelId) as (ChannelRow & { networkId: string; name: string }) | undefined;
  return row ? toChannelState(row) : null;
};

export const getChannelByName = (db: SqliteDb, networkId: string, name: string) => {
  const channel = getStoredChannelByName(db, networkId, name);
  const row = channel ? (db.prepare('SELECT isOpen FROM buffers WHERE id = ?').get(channel.id) as { isOpen: number } | undefined) : null;
  return row?.isOpen ? channel : null;
};

export const getStoredChannelByName = (db: SqliteDb, networkId: string, name: string) => {
  const row = db.prepare(`${channelSelect} AND buffers.networkId = ? AND buffers.targetKey = ?`)
    .get(networkId, normalizeIrcIdentifier(name)) as (ChannelRow & { networkId: string; name: string }) | undefined;
  return row ? toChannelState(row) : null;
};

export const upsertChannel = (db: SqliteDb, input: ChannelInput) => {
  const existing = getStoredChannelByName(db, input.networkId, input.name);
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

export const deleteChannelByName = (db: SqliteDb, networkId: string, channelName: string) => {
  const buffer = getStoredBufferByTarget(db, networkId, channelName);
  if (buffer?.kind === 'channel') {
    removeBuffer(db, buffer.id);
  }
};

export const updateChannelUsers = (db: SqliteDb, networkId: string, channelName: string, users: ChannelUserState[]) => {
  const channel = getStoredChannelByName(db, networkId, channelName);
  if (!channel) {
    return;
  }
  db.prepare('UPDATE channel_details SET users = ?, updatedAt = ? WHERE id = ?')
    .run(JSON.stringify(users), Date.now(), channel.id);
};

export const updateChannelTopic = (db: SqliteDb, networkId: string, channelName: string, topic: string) => {
  const channel = getStoredChannelByName(db, networkId, channelName);
  if (!channel) {
    return;
  }
  db.prepare('UPDATE channel_details SET topic = ?, updatedAt = ? WHERE id = ?')
    .run(topic, Date.now(), channel.id);
};

const getChannelCreatedAt = (db: SqliteDb, id: string) =>
  (db.prepare('SELECT createdAt FROM channel_details WHERE id = ?').get(id) as { createdAt: number } | undefined)?.createdAt ?? null;
