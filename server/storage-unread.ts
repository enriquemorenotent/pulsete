import type { SqliteDb } from './storage-sqlite.js';
import type { MessageInput } from './storage-types.js';
import { shouldIncrementPriorityUnread, shouldIncrementUnread } from './runtime-buffer-activity.js';
import { isUserMuted, resolveMutedTarget } from '../shared/muted-nicks.js';
import { listMutedNicks } from './storage-muted-nicks.js';
import { getNetwork } from './storage-networks.js';
import type { BufferState } from '../shared/protocol-chat.js';

export type MessageAttention = { currentNick?: string | null; altNicks?: readonly string[]; messageMuted?: boolean };

export const recordUnreadMessage = (db: SqliteDb, message: MessageInput, bufferId: string, attention?: MessageAttention) => {
  if (!shouldIncrementUnread(message) || (message.delivery && message.delivery !== 'live')) return;
  const buffer = db.prepare('SELECT kind FROM buffers WHERE id = ?').get(bufferId) as Pick<BufferState, 'kind'>;
  const network = getNetwork(db, message.networkId);
  const muted = attention?.messageMuted ?? isUserMuted(
    listMutedNicks(db, message.networkId), resolveMutedTarget(message.networkId, message.nick, message.senderIdentity),
  );
  const priority = shouldIncrementPriorityUnread({
    buffer, message,
    currentNick: attention?.currentNick ?? network?.nick,
    altNicks: attention?.altNicks ?? network?.altNicks,
  });
  db.prepare(`INSERT INTO unread_messages (messageId, bufferId, priority, muted, messageTs, messageOrder)
    SELECT id, bufferId, ?, ?, ts, rowid FROM messages WHERE id = ?`)
    .run(priority ? 1 : 0, muted ? 1 : 0, message.id);
};

export const refreshUnreadVisibility = (db: SqliteDb, networkId: string) => {
  const mutedNicks = listMutedNicks(db, networkId);
  const rows = db.prepare(`SELECT m.id, m.nick, m.senderIdentityKind, m.senderIdentityValue
    FROM unread_messages u JOIN messages m ON m.id = u.messageId
    JOIN buffers b ON b.id = u.bufferId WHERE b.networkId = ?`).all(networkId) as Array<{
      id: string; nick: string | null; senderIdentityKind: 'nick' | 'account' | 'userhost' | null; senderIdentityValue: string | null;
    }>;
  const update = db.prepare('UPDATE unread_messages SET muted = ? WHERE messageId = ? AND muted <> ?');
  for (const row of rows) {
    const identity = row.senderIdentityKind && row.senderIdentityValue ? { kind: row.senderIdentityKind, value: row.senderIdentityValue } : null;
    const muted = isUserMuted(mutedNicks, resolveMutedTarget(networkId, row.nick, identity)) ? 1 : 0;
    update.run(muted, row.id, muted);
  }
};

export const unreadAnchorSql = `(SELECT messageId FROM unread_messages
  WHERE bufferId = buffers.id AND muted = 0 ORDER BY messageTs, messageOrder LIMIT 1)`;
