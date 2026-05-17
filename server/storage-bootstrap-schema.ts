import {
  historyImportBatchesSchemaSql,
  messageSearchSchemaSql,
  queryPeerIdentitiesSchemaSql,
  queryNickAliasesSchemaSql,
} from './storage-schema-helpers.js';

export const storageBootstrapSchemaSql = `
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  PRAGMA busy_timeout = 5000;

  CREATE TABLE IF NOT EXISTS networks (
    id TEXT PRIMARY KEY,
    workspaceOpen INTEGER NOT NULL DEFAULT 0,
    name TEXT NOT NULL,
    host TEXT NOT NULL,
    port INTEGER NOT NULL,
    tls INTEGER NOT NULL,
    nick TEXT NOT NULL,
    username TEXT NOT NULL DEFAULT '',
    realName TEXT NOT NULL DEFAULT '',
    password TEXT,
    authMethod TEXT NOT NULL DEFAULT 'none',
    authTarget TEXT NOT NULL DEFAULT 'NickServ',
    authAccount TEXT NOT NULL DEFAULT '',
    favorite INTEGER NOT NULL DEFAULT 0,
    notes TEXT NOT NULL DEFAULT '',
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS network_alt_nicks (
    networkId TEXT NOT NULL REFERENCES networks(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    nick TEXT NOT NULL,
    nickKey TEXT NOT NULL,
    PRIMARY KEY (networkId, nickKey),
    UNIQUE (networkId, position)
  );

  CREATE TABLE IF NOT EXISTS network_historical_self_nicks (
    networkId TEXT NOT NULL REFERENCES networks(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    nick TEXT NOT NULL,
    nickKey TEXT NOT NULL,
    PRIMARY KEY (networkId, nickKey),
    UNIQUE (networkId, position)
  );

  CREATE TABLE IF NOT EXISTS network_auto_join_channels (
    networkId TEXT NOT NULL REFERENCES networks(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    channel TEXT NOT NULL,
    channelKey TEXT NOT NULL,
    PRIMARY KEY (networkId, channelKey),
    UNIQUE (networkId, position)
  );

  CREATE TABLE IF NOT EXISTS buffers (
    id TEXT PRIMARY KEY,
    networkId TEXT NOT NULL REFERENCES networks(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    target TEXT NOT NULL,
    targetKey TEXT NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    isOpen INTEGER NOT NULL DEFAULT 1,
    unread INTEGER NOT NULL DEFAULT 0,
    priorityUnread INTEGER NOT NULL DEFAULT 0,
    lastReadTs INTEGER,
    lastReadMessageId TEXT,
    ircCloudAvatarId TEXT,
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL,
    UNIQUE(networkId, targetKey)
  );

  CREATE TABLE IF NOT EXISTS buffer_self_nick_aliases (
    bufferId TEXT NOT NULL REFERENCES buffers(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    nick TEXT NOT NULL,
    nickKey TEXT NOT NULL,
    PRIMARY KEY (bufferId, nickKey),
    UNIQUE (bufferId, position)
  );

  CREATE TABLE IF NOT EXISTS channel_details (
    id TEXT PRIMARY KEY REFERENCES buffers(id) ON DELETE CASCADE,
    topic TEXT NOT NULL DEFAULT '',
    users TEXT NOT NULL DEFAULT '[]',
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    bufferId TEXT NOT NULL REFERENCES buffers(id) ON DELETE CASCADE,
    nick TEXT,
    senderIdentityKind TEXT,
    senderIdentityValue TEXT,
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

${historyImportBatchesSchemaSql}

${queryNickAliasesSchemaSql}

${queryPeerIdentitiesSchemaSql}

  CREATE TABLE IF NOT EXISTS friends (
    id TEXT PRIMARY KEY,
    nick TEXT NOT NULL COLLATE NOCASE UNIQUE,
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS nick_emoji_tags (
    id TEXT PRIMARY KEY,
    networkId TEXT NOT NULL REFERENCES networks(id) ON DELETE CASCADE,
    nick TEXT NOT NULL COLLATE NOCASE,
    identityKind TEXT NOT NULL DEFAULT 'nick',
    identityValue TEXT NOT NULL,
    emoji TEXT NOT NULL,
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL,
    UNIQUE(networkId, identityKind, identityValue)
  );

  CREATE TABLE IF NOT EXISTS muted_nicks (
    id TEXT PRIMARY KEY,
    networkId TEXT NOT NULL REFERENCES networks(id) ON DELETE CASCADE,
    nick TEXT NOT NULL COLLATE NOCASE,
    identityKind TEXT NOT NULL DEFAULT 'nick',
    identityValue TEXT NOT NULL,
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL,
    UNIQUE(networkId, identityKind, identityValue)
  );

  CREATE INDEX IF NOT EXISTS idx_messages_buffer
    ON messages(bufferId, ts DESC);

${messageSearchSchemaSql}

  CREATE INDEX IF NOT EXISTS idx_buffers_network
    ON buffers(networkId, isOpen, createdAt ASC);

  CREATE INDEX IF NOT EXISTS idx_friends_nick
    ON friends(nick COLLATE NOCASE, createdAt ASC);

  CREATE INDEX IF NOT EXISTS idx_nick_emoji_tags_network_nick
    ON nick_emoji_tags(networkId, nick COLLATE NOCASE, createdAt ASC);

  CREATE INDEX IF NOT EXISTS idx_muted_nicks_network_nick
    ON muted_nicks(networkId, nick COLLATE NOCASE, createdAt ASC);
`;
