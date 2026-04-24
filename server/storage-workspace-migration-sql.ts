export const createWorkspaceMigrationTablesSql = `
  CREATE TABLE networks_next (
    id TEXT PRIMARY KEY,
    workspaceOpen INTEGER NOT NULL DEFAULT 0,
    name TEXT NOT NULL,
    host TEXT NOT NULL,
    port INTEGER NOT NULL,
    tls INTEGER NOT NULL,
    nick TEXT NOT NULL,
    username TEXT NOT NULL,
    realName TEXT NOT NULL DEFAULT '',
    password TEXT,
    authMethod TEXT NOT NULL DEFAULT 'none',
    authTarget TEXT NOT NULL DEFAULT 'NickServ',
    authAccount TEXT NOT NULL DEFAULT '',
    favorite INTEGER NOT NULL DEFAULT 0,
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL
  );
  CREATE TABLE network_alt_nicks_next (
    networkId TEXT NOT NULL REFERENCES networks_next(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    nick TEXT NOT NULL,
    nickKey TEXT NOT NULL,
    PRIMARY KEY (networkId, nickKey),
    UNIQUE (networkId, position)
  );
  CREATE TABLE network_historical_self_nicks_next (
    networkId TEXT NOT NULL REFERENCES networks_next(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    nick TEXT NOT NULL,
    nickKey TEXT NOT NULL,
    PRIMARY KEY (networkId, nickKey),
    UNIQUE (networkId, position)
  );
  CREATE TABLE network_auto_join_channels_next (
    networkId TEXT NOT NULL REFERENCES networks_next(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    channel TEXT NOT NULL,
    channelKey TEXT NOT NULL,
    PRIMARY KEY (networkId, channelKey),
    UNIQUE (networkId, position)
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
  CREATE TABLE buffer_self_nick_aliases_next (
    bufferId TEXT NOT NULL REFERENCES buffers_next(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    nick TEXT NOT NULL,
    nickKey TEXT NOT NULL,
    PRIMARY KEY (bufferId, nickKey),
    UNIQUE (bufferId, position)
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
  CREATE TABLE query_nick_aliases_next (
    bufferId TEXT NOT NULL REFERENCES buffers_next(id) ON DELETE CASCADE,
    networkId TEXT NOT NULL,
    nick TEXT NOT NULL,
    nickKey TEXT NOT NULL,
    firstSeenAt INTEGER NOT NULL,
    lastSeenAt INTEGER NOT NULL,
    source TEXT NOT NULL,
    PRIMARY KEY (bufferId, nickKey)
  );
  CREATE TABLE muted_nicks_next (
    id TEXT PRIMARY KEY,
    networkId TEXT NOT NULL REFERENCES networks_next(id) ON DELETE CASCADE,
    nick TEXT NOT NULL COLLATE NOCASE,
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL,
    UNIQUE(networkId, nick)
  );
`;
