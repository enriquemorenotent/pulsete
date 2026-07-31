import { randomUUID } from 'node:crypto';
import type { UserAvatarOverride } from '../shared/protocol-preferences.js';
import {
  identityFromNick,
  normalizeNetworkUserIdentity,
  type NetworkUserIdentity,
} from '../shared/user-identity.js';
import type { SqliteDb } from './storage-sqlite.js';

type AvatarOverrideRow = {
  id: string;
  networkId: string;
  nick: string;
  identityKind: NetworkUserIdentity['kind'];
  identityValue: string;
  sourceKind: 'blob' | 'external';
  imageData: Buffer | null;
  mimeType: string | null;
  externalUrl: string | null;
  createdAt: number;
  updatedAt: number;
};

export type AvatarOverrideSource = {
  data: Buffer;
  mimeType: string;
  updatedAt: number;
};

export type AvatarOverrideInput = {
  networkId: string;
  nick: string;
  identity?: NetworkUserIdentity | null;
} & (
  | { sourceKind: 'blob'; data: Buffer; mimeType: string }
  | { sourceKind: 'external'; externalUrl: string }
);

const columns = `id, networkId, nick, identityKind, identityValue, sourceKind,
  imageData, mimeType, externalUrl, createdAt, updatedAt`;

export class StorageAvatarOverridesRepository {
  constructor(private readonly db: SqliteDb) {}

  list(): UserAvatarOverride[] {
    const rows = this.db.prepare(`SELECT ${columns}
      FROM user_avatar_overrides ORDER BY networkId, nick COLLATE NOCASE`).all() as AvatarOverrideRow[];
    return rows.map(toAvatarOverride);
  }

  get(id: string): UserAvatarOverride | null {
    const row = this.getRow(id);
    return row ? toAvatarOverride(row) : null;
  }

  getSource(id: string): AvatarOverrideSource | null {
    const row = this.getRow(id);
    if (!row || row.sourceKind !== 'blob' || !row.imageData || !row.mimeType) {
      return null;
    }
    return { data: row.imageData, mimeType: row.mimeType, updatedAt: row.updatedAt };
  }

  upsert(input: AvatarOverrideInput): UserAvatarOverride {
    const identity = normalizeNetworkUserIdentity(input.identity) ?? identityFromNick(input.nick);
    const existing = this.db.prepare(`SELECT id, updatedAt FROM user_avatar_overrides
      WHERE networkId = ? AND identityKind = ? AND identityValue = ?`)
      .get(input.networkId, identity.kind, identity.value) as {
        id: string;
        updatedAt: number;
      } | undefined;
    const id = existing?.id ?? randomUUID();
    const now = Math.max(Date.now(), (existing?.updatedAt ?? 0) + 1);
    const data = input.sourceKind === 'blob' ? input.data : null;
    const mimeType = input.sourceKind === 'blob' ? input.mimeType : null;
    const externalUrl = input.sourceKind === 'external' ? input.externalUrl : null;
    this.db.prepare(`INSERT INTO user_avatar_overrides (
      id, networkId, nick, identityKind, identityValue, sourceKind,
      imageData, mimeType, externalUrl, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(networkId, identityKind, identityValue) DO UPDATE SET
      nick = excluded.nick,
      sourceKind = excluded.sourceKind,
      imageData = excluded.imageData,
      mimeType = excluded.mimeType,
      externalUrl = excluded.externalUrl,
      updatedAt = excluded.updatedAt`)
      .run(
        id,
        input.networkId,
        input.nick,
        identity.kind,
        identity.value,
        input.sourceKind,
        data,
        mimeType,
        externalUrl,
        now,
        now,
      );
    return this.get(id)!;
  }

  remove(id: string): UserAvatarOverride | null {
    const existing = this.get(id);
    if (existing) {
      this.db.prepare('DELETE FROM user_avatar_overrides WHERE id = ?').run(id);
    }
    return existing;
  }

  private getRow(id: string) {
    return this.db.prepare(`SELECT ${columns}
      FROM user_avatar_overrides WHERE id = ?`).get(id) as AvatarOverrideRow | undefined;
  }
}

const toAvatarOverride = (row: AvatarOverrideRow): UserAvatarOverride => ({
  id: row.id,
  networkId: row.networkId,
  nick: row.nick,
  identity: { kind: row.identityKind, value: row.identityValue },
  imageUrl: row.sourceKind === 'external'
    ? row.externalUrl!
    : `/api/user-avatar-overrides/${encodeURIComponent(row.id)}/image?v=${row.updatedAt}`,
  updatedAt: row.updatedAt,
});
