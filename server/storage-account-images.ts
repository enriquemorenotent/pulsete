import type { SqliteDb } from './storage-sqlite.js';

export const accountImagesSchemaSql = `
  CREATE TABLE IF NOT EXISTS account_images (
    networkId TEXT PRIMARY KEY REFERENCES networks(id) ON DELETE CASCADE,
    sourceUrl TEXT NOT NULL,
    mimeType TEXT NOT NULL,
    imageData BLOB NOT NULL,
    updatedAt INTEGER NOT NULL
  );
`;

export type CachedAccountImage = {
  mimeType: string;
  imageData: Buffer;
  updatedAt: number;
};

export function getAccountImage(db: SqliteDb, networkId: string, sourceUrl: string) {
  return db.prepare(`SELECT mimeType, imageData, updatedAt FROM account_images
    WHERE networkId = ? AND sourceUrl = ?`).get(networkId, sourceUrl) as CachedAccountImage | undefined;
}

export function saveAccountImage(db: SqliteDb, networkId: string, sourceUrl: string, mimeType: string, imageData: Buffer) {
  db.prepare(`INSERT INTO account_images (networkId, sourceUrl, mimeType, imageData, updatedAt)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(networkId) DO UPDATE SET sourceUrl = excluded.sourceUrl,
      mimeType = excluded.mimeType, imageData = excluded.imageData, updatedAt = excluded.updatedAt`)
    .run(networkId, sourceUrl, mimeType, imageData, Date.now());
}
