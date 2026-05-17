const normalizeTargetSql = (column: string) =>
  `replace(replace(replace(replace(lower(${column}), '[', '{'), ']', '}'), '\\', '|'), '^', '~')`;

export const existingBuffersSql = `
  SELECT id, networkId, kind, target, unread, priorityUnread, lastReadTs, lastReadMessageId, createdAt, updatedAt
  FROM buffers
  ORDER BY createdAt ASC
`;

export const messageConversationsSql = `
  SELECT networkId, target, MIN(ts) AS createdAt
  FROM messages
  GROUP BY networkId, target
`;

export const batchConversationsSql = `
  SELECT networkId, target, MIN(createdAt) AS createdAt
  FROM history_import_batches
  GROUP BY networkId, target
`;

export const insertBufferSql = `
  INSERT INTO buffers_next
    (id, networkId, kind, target, targetKey, isOpen, unread, priorityUnread, lastReadTs, lastReadMessageId, createdAt, updatedAt)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

export const insertConversationMapSql = `
  INSERT INTO normalized_buffer_conversation_map (networkId, targetKey, bufferId)
  VALUES (?, ?, ?)
`;

export const insertLegacyBufferMapSql = `
  INSERT INTO normalized_buffer_legacy_map (legacyBufferId, bufferId)
  VALUES (?, ?)
`;

export const createScratchTablesSql = `
  CREATE TABLE networks_next (
    id TEXT PRIMARY KEY,
    templateId TEXT,
    managerHidden INTEGER NOT NULL DEFAULT 0,
    name TEXT NOT NULL,
    host TEXT NOT NULL,
    port INTEGER NOT NULL,
    tls INTEGER NOT NULL,
    nick TEXT NOT NULL,
    username TEXT NOT NULL DEFAULT '',
    iconUrl TEXT NOT NULL DEFAULT '',
    realName TEXT NOT NULL DEFAULT '',
    password TEXT,
    authMethod TEXT NOT NULL DEFAULT 'none',
    authTarget TEXT NOT NULL DEFAULT 'NickServ',
    authAccount TEXT NOT NULL DEFAULT '',
    favorite INTEGER NOT NULL DEFAULT 0,
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL
  );
  CREATE TABLE buffers_next (
    id TEXT PRIMARY KEY,
    networkId TEXT NOT NULL REFERENCES networks_next(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    target TEXT NOT NULL,
    targetKey TEXT NOT NULL,
    isOpen INTEGER NOT NULL DEFAULT 1,
    unread INTEGER NOT NULL DEFAULT 0,
    priorityUnread INTEGER NOT NULL DEFAULT 0,
    lastReadTs INTEGER,
    lastReadMessageId TEXT,
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL,
    UNIQUE(networkId, targetKey)
  );
  CREATE TABLE channel_details_next (
    id TEXT PRIMARY KEY REFERENCES buffers_next(id) ON DELETE CASCADE,
    topic TEXT NOT NULL DEFAULT '',
    users TEXT NOT NULL DEFAULT '[]',
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL
  );
  CREATE TABLE messages_next (
    id TEXT PRIMARY KEY,
    bufferId TEXT NOT NULL REFERENCES buffers_next(id) ON DELETE CASCADE,
    nick TEXT,
    speakerRole TEXT NOT NULL DEFAULT 'unknown',
    speakerNick TEXT,
    attributionSource TEXT NOT NULL DEFAULT 'unknown',
    attributionConfidence TEXT NOT NULL DEFAULT 'low',
    importBatchId TEXT,
    body TEXT NOT NULL,
    kind TEXT NOT NULL,
    self INTEGER NOT NULL,
    ts INTEGER NOT NULL
  );
  CREATE TABLE history_import_batches_next (
    id TEXT PRIMARY KEY,
    bufferId TEXT NOT NULL REFERENCES buffers_next(id) ON DELETE CASCADE,
    selfNickSnapshot TEXT NOT NULL DEFAULT '[]',
    createdAt INTEGER NOT NULL
  );
  CREATE TABLE normalized_buffer_conversation_map (
    networkId TEXT NOT NULL,
    targetKey TEXT NOT NULL,
    bufferId TEXT NOT NULL,
    PRIMARY KEY (networkId, targetKey)
  );
  CREATE TABLE normalized_buffer_legacy_map (
    legacyBufferId TEXT PRIMARY KEY,
    bufferId TEXT NOT NULL
  );
`;

export const copyNetworksSql = `
  INSERT INTO networks_next
    (id, templateId, managerHidden, name, host, port, tls, nick, username, iconUrl, realName, password, authMethod, authTarget, authAccount, favorite, createdAt, updatedAt)
  SELECT id, templateId, managerHidden, name, host, port, tls, nick, username, iconUrl, realName, password, authMethod, authTarget, authAccount, favorite, createdAt, updatedAt
  FROM networks
`;

export const copyChannelDetailsSql = `
  INSERT INTO channel_details_next (id, topic, users, createdAt, updatedAt)
  SELECT id, topic, users, createdAt, updatedAt
  FROM channel_details
`;

export const copyMessagesSql = `
  INSERT INTO messages_next
    (id, bufferId, nick, speakerRole, speakerNick, attributionSource, attributionConfidence, importBatchId, body, kind, self, ts)
  SELECT m.id, map.bufferId, m.nick, coalesce(m.speakerRole, 'unknown'), m.speakerNick, coalesce(m.attributionSource, 'unknown'), coalesce(m.attributionConfidence, 'low'), m.importBatchId, m.body, m.kind, m.self, m.ts
  FROM messages AS m
  JOIN normalized_buffer_conversation_map AS map
    ON map.networkId = m.networkId
   AND map.targetKey = ${normalizeTargetSql('m.target')}
  ORDER BY m.rowid ASC
`;

export const copyLegacyBatchesSql = `
  INSERT INTO history_import_batches_next (id, bufferId, selfNickSnapshot, createdAt)
  SELECT h.id, coalesce(legacy.bufferId, map.bufferId), h.selfNickSnapshot, h.createdAt
  FROM history_import_batches AS h
  LEFT JOIN normalized_buffer_legacy_map AS legacy
    ON legacy.legacyBufferId = h.bufferId
  LEFT JOIN normalized_buffer_conversation_map AS map
    ON map.networkId = h.networkId
   AND map.targetKey = ${normalizeTargetSql('h.target')}
  WHERE coalesce(legacy.bufferId, map.bufferId) IS NOT NULL
  ORDER BY h.createdAt ASC
`;

export const copyNormalizedBatchesSql = `
  INSERT INTO history_import_batches_next (id, bufferId, selfNickSnapshot, createdAt)
  SELECT h.id, legacy.bufferId, h.selfNickSnapshot, h.createdAt
  FROM history_import_batches AS h
  JOIN normalized_buffer_legacy_map AS legacy
    ON legacy.legacyBufferId = h.bufferId
  ORDER BY h.createdAt ASC
`;
