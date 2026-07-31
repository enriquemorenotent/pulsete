export const userStateStorageSchemaVersion = 30;

export const userStateSchemaSql = `
  CREATE TABLE IF NOT EXISTS workspace_preferences (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    value TEXT NOT NULL DEFAULT '{}',
    legacyBrowserImported INTEGER NOT NULL DEFAULT 0,
    updatedAt INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS buffer_drafts (
    bufferId TEXT PRIMARY KEY REFERENCES buffers(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    updatedAt INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS user_avatar_overrides (
    id TEXT PRIMARY KEY,
    networkId TEXT NOT NULL REFERENCES networks(id) ON DELETE CASCADE,
    nick TEXT NOT NULL COLLATE NOCASE,
    identityKind TEXT NOT NULL,
    identityValue TEXT NOT NULL,
    sourceKind TEXT NOT NULL CHECK (sourceKind IN ('blob', 'external')),
    imageData BLOB,
    mimeType TEXT,
    externalUrl TEXT,
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL,
    UNIQUE(networkId, identityKind, identityValue),
    CHECK (
      (sourceKind = 'blob' AND imageData IS NOT NULL AND mimeType IS NOT NULL AND externalUrl IS NULL)
      OR
      (sourceKind = 'external' AND imageData IS NULL AND mimeType IS NULL AND externalUrl IS NOT NULL)
    )
  );

  CREATE INDEX IF NOT EXISTS idx_user_avatar_overrides_network
    ON user_avatar_overrides(networkId, nick COLLATE NOCASE, updatedAt DESC);
`;

export const ensureWorkspacePreferencesRow = (now = Date.now()) => ({
  sql: `INSERT OR IGNORE INTO workspace_preferences
        (id, value, legacyBrowserImported, updatedAt)
        VALUES (1, '{}', 0, ?)`,
  now,
});
