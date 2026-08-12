import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import test from 'node:test';
import { createHttpHandler } from '../server/http-router.js';
import { RuntimeHost } from '../server/runtime-host.js';
import { openSqliteDatabase, type SqliteDb } from '../server/storage-sqlite.js';
import { attachWebSocketServer } from '../server/ws-server.js';
import { createNetworkInput } from './helpers/http-server-helpers.js';
import { listen } from './helpers/http-request-helpers.js';
import {
  closeWebSocket,
  connectWebSocket,
  waitForWebSocketCloseDetails,
} from './helpers/http-websocket-test-helpers.js';

const backupChannelUser = { account: 'alice', away: false, host: 'example.test', identity: { kind: 'account' as const, value: 'alice' }, mode: 'op' as const, modes: ['op' as const], nick: 'Alice', realname: 'Alice Backup', username: 'alice' };
const backupAvatar = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

test('backup export and import fully replace stored app data', async () => {
  const context = await createBackupServer();
  try {
    const original = seedBackupFixture(context.host);
    const exportResponse = await fetch(`http://127.0.0.1:${context.port}/api/backups/export`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        browserPreferences: {
          'pulsete.sidebar.width': '320',
          ignored: 'value',
        },
      }),
    });
    const backup = Buffer.from(await exportResponse.arrayBuffer());

    assert.equal(exportResponse.status, 200);
    assert.match(exportResponse.headers.get('content-disposition') ?? '', /pulsete-backup-.+\.pulsete-backup/);

    context.host.currentStorage().networks.upsert(createNetworkInput({ name: 'ThrowawayNet' }));
    const importResponse = await fetch(`http://127.0.0.1:${context.port}/api/backups/import`, {
      method: 'POST',
      body: backup,
    });
    const importBody = await importResponse.json() as { browserPreferences: Record<string, string> };
    const restored = context.host.currentStorage();
    const networks = restored.networks.list();

    assert.equal(importResponse.status, 200);
    assert.deepEqual(importBody.browserPreferences, { 'pulsete.sidebar.width': '320' });
    assert.equal(networks.length, 1);
    assert.equal(networks[0].name, 'BackupNet');
    assert.equal(networks[0].workspaceOpen, true);
    assert.equal(networks[0].hasPassword, true);
    assert.equal(networks[0].authMethod, 'sasl-plain');
    assert.equal(networks[0].authTarget, 'BackupAuth');
    assert.equal(networks[0].authAccount, 'backup-account');
    assert.equal(networks[0].favorite, true);
    assert.equal(networks[0].notes, 'network note');
    assert.deepEqual(networks[0].altNicks, ['backup_', 'backup__']);
    assert.deepEqual(networks[0].historicalSelfNicks, ['oldBackup']);
    assert.deepEqual(networks[0].autoJoin, ['#backup', '#ops']);
    assert.equal(restored.networks.getRuntime(original.networkId)?.password, 'secret-pass');
    const buffer = restored.conversations.getBufferByTarget(original.networkId, '#backup');
    assert.ok(buffer);
    assert.equal(buffer.notes, 'buffer note');
    assert.equal(buffer.unread, 2);
    assert.equal(buffer.priorityUnread, 1);
    assert.equal(buffer.lastReadTs, 12);
    assert.equal(buffer.lastReadMessageId, 'message-1');
    assert.deepEqual(buffer.selfNickAliases, ['BackupSelf']);
    const channel = restored.conversations.getChannelByName(original.networkId, '#backup');
    assert.equal(channel?.topic, 'stored topic');
    assert.deepEqual(channel?.users, [backupChannelUser]);
    const messages = restored.conversations.listAllMessages(original.networkId, '#backup');
    assert.equal(messages.length, 1);
    assert.equal(messages[0].importBatchId, 'batch-1');
    assert.equal(messages[0].speakerRole, 'peer');
    assert.equal(messages[0].speakerNick, 'Alice');
    assert.equal(messages[0].attributionSource, 'import-alias');
    assert.equal(messages[0].attributionConfidence, 'high');
    assert.equal(
      restored.conversations.searchMessagesByBufferId(buffer.id, 'hello backup', 10).messages[0]?.id,
      'message-1'
    );
    assert.equal(restored.friends.list()[0]?.nick, 'Alice');
    assert.equal(restored.mutedNicks.list(original.networkId)[0]?.nick, 'Mallory');
    assert.equal(restored.nickEmojis.list(original.networkId)[0]?.emoji, ':)');
    assert.equal(restored.preferences.get().hideOfflineFriends, true);
    assert.equal(restored.preferences.get().rightSidebarWidth, 336);
    assert.equal(restored.drafts.get(original.queryId)?.body, 'unfinished backup reply');
    const avatar = restored.avatarOverrides.get(original.avatarId);
    assert.equal(avatar?.nick, 'Alice');
    assert.deepEqual(restored.avatarOverrides.getSource(original.avatarId)?.data, backupAvatar);
    assert.equal(restored.preferences.isLegacyBrowserImportPending(), false);
    assertBackupTables(restored.databasePath);
    const preRestoreBackup = readdirSync(join(context.dir, 'backups'))
      .find((name) => name.startsWith('pre-restore-'));
    assert.ok(preRestoreBackup);
    const preserved = openSqliteDatabase(join(context.dir, 'backups', preRestoreBackup, 'db.sqlite'));
    try {
      const names = preserved.prepare('SELECT name FROM networks ORDER BY name').all() as Array<{ name: string }>;
      assert.deepEqual(names.map((network) => network.name), ['BackupNet', 'ThrowawayNet']);
    } finally {
      preserved.close();
    }
  } finally {
    await context.close();
  }
});

test('backup import closes existing sockets and new sockets read restored state', async () => {
  const context = await createBackupServer();
  let socket: Awaited<ReturnType<typeof connectWebSocket>>['socket'] | null = null;
  try {
    seedBackupFixture(context.host);
    const exportResponse = await fetch(`http://127.0.0.1:${context.port}/api/backups/export`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ browserPreferences: {} }),
    });
    const backup = Buffer.from(await exportResponse.arrayBuffer());
    socket = (await connectWebSocket(context.port)).socket;
    const closePromise = waitForWebSocketCloseDetails(socket);

    context.host.currentStorage().networks.upsert(createNetworkInput({ name: 'AfterExportNet' }));
    const importResponse = await fetch(`http://127.0.0.1:${context.port}/api/backups/import`, {
      method: 'POST',
      body: backup,
    });
    const closeDetails = await closePromise;
    const nextConnection = await connectWebSocket(context.port);
    const networks = (nextConnection.ready.snapshot as { networks: Array<{ name: string }> }).networks;

    assert.equal(importResponse.status, 200);
    assert.equal(closeDetails.code, 1001);
    assert.deepEqual(networks.map((network) => network.name), ['BackupNet']);
    await closeWebSocket(nextConnection.socket);
    socket = null;
  } finally {
    if (socket) {
      await closeWebSocket(socket);
    }
    await context.close();
  }
});

test('backup import rejects invalid files without replacing current data', async () => {
  const context = await createBackupServer();
  try {
    seedBackupFixture(context.host);
    const response = await fetch(`http://127.0.0.1:${context.port}/api/backups/import`, {
      method: 'POST',
      body: Buffer.from('not a backup'),
    });
    const body = await response.json() as { message: string };

    assert.equal(response.status, 400);
    assert.equal(body.message, 'Invalid backup file');
    assert.equal(context.host.currentStorage().networks.list()[0]?.name, 'BackupNet');
  } finally {
    await context.close();
  }
});

test('current-version backups must contain the durable user-state tables', async () => {
  const context = await createBackupServer();
  try {
    seedBackupFixture(context.host);
    const exportResponse = await fetch(`http://127.0.0.1:${context.port}/api/backups/export`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const envelope = JSON.parse(gunzipSync(
      Buffer.from(await exportResponse.arrayBuffer()),
    ).toString('utf8')) as { database: string };
    const damagedPath = join(context.dir, 'damaged.sqlite');
    writeFileSync(damagedPath, Buffer.from(envelope.database, 'base64'));
    const db = openSqliteDatabase(damagedPath);
    db.exec('DROP TABLE buffer_drafts');
    db.close();
    envelope.database = readFileSync(damagedPath).toString('base64');

    const response = await fetch(`http://127.0.0.1:${context.port}/api/backups/import`, {
      method: 'POST',
      body: gzipSync(Buffer.from(JSON.stringify(envelope))),
    });
    const body = await response.json() as { message: string };

    assert.equal(response.status, 400);
    assert.equal(body.message, 'Invalid backup database');
    assert.equal(context.host.currentStorage().networks.list()[0]?.name, 'BackupNet');
  } finally {
    await context.close();
  }
});

const seedBackupFixture = (host: RuntimeHost) => {
  const storage = host.currentStorage();
  const network = storage.networks.upsert(createNetworkInput({
    altNicks: ['backup_', 'backup__'],
    authAccount: 'backup-account',
    authMethod: 'sasl-plain',
    authTarget: 'BackupAuth',
    autoJoin: ['#backup', '#ops'],
    favorite: true,
    historicalSelfNicks: ['oldBackup'],
    name: 'BackupNet',
    notes: 'network note',
    password: 'secret-pass',
    workspaceOpen: true,
  }));
  storage.conversations.upsertChannel({
    name: '#backup',
    networkId: network.id,
    topic: 'stored topic',
    users: [backupChannelUser],
  });
  storage.conversations.upsertBuffer({
    id: storage.conversations.getBufferByTarget(network.id, '#backup')?.id,
    kind: 'channel',
    lastReadMessageId: 'message-1',
    lastReadTs: 12,
    networkId: network.id,
    notes: 'buffer note',
    priorityUnread: 1,
    selfNickAliases: ['BackupSelf'],
    target: '#backup',
    unread: 2,
  });
  storage.conversations.appendMessage({
    body: 'hello backup',
    id: 'message-1',
    importBatchId: 'batch-1',
    attributionConfidence: 'high',
    attributionSource: 'import-alias',
    kind: 'line',
    networkId: network.id,
    nick: 'Alice',
    self: false,
    speakerNick: 'Alice',
    speakerRole: 'peer',
    target: '#backup',
    ts: 1,
  });
  const query = storage.conversations.upsertQuery(network.id, 'Alice');
  storage.conversations.recordObservedQueryNickChange(network.id, 'Alice', 'Alice_');
  insertHistoryImportBatch(storage.databasePath, storage.conversations.getBufferByTarget(network.id, '#backup')!.id);
  storage.friends.upsert({ nick: 'Alice' });
  storage.mutedNicks.upsert({ networkId: network.id, nick: 'Mallory' });
  storage.nickEmojis.upsert({ networkId: network.id, nick: 'Alice', emoji: ':)' });
  storage.preferences.update({
    hideOfflineFriends: true,
    rightSidebarWidth: 336,
  });
  storage.preferences.markLegacyBrowserImported();
  storage.drafts.save(query.id, 'unfinished backup reply');
  const avatar = storage.avatarOverrides.upsert({
    data: backupAvatar,
    identity: { kind: 'account', value: 'alice' },
    mimeType: 'image/png',
    networkId: network.id,
    nick: 'Alice',
    sourceKind: 'blob',
  });
  return { avatarId: avatar.id, networkId: network.id, queryId: query.id };
};

const insertHistoryImportBatch = (databasePath: string, bufferId: string) => {
  const db = openSqliteDatabase(databasePath);
  try {
    db.prepare(
      `INSERT INTO history_import_batches (id, bufferId, selfNickSnapshot, createdAt)
       VALUES (?, ?, ?, ?)`
    ).run('batch-1', bufferId, JSON.stringify(['backup-nick', 'backup_']), 5);
  } finally {
    db.close();
  }
};

const assertBackupTables = (databasePath: string) => {
  const db = openSqliteDatabase(databasePath);
  try {
    assert.equal(readCount(db, 'network_alt_nicks'), 2);
    assert.equal(readCount(db, 'network_historical_self_nicks'), 1);
    assert.equal(readCount(db, 'network_auto_join_channels'), 2);
    assert.equal(readCount(db, 'buffer_self_nick_aliases'), 1);
    assert.equal(readCount(db, 'history_import_batches'), 1);
    assert.equal(readCount(db, 'query_nick_aliases'), 2);
    assert.equal(readCount(db, 'message_search_fts'), 1);
    assert.equal(readCount(db, 'workspace_preferences'), 1);
    assert.equal(readCount(db, 'buffer_drafts'), 1);
    assert.equal(readCount(db, 'user_avatar_overrides'), 1);
  } finally {
    db.close();
  }
};

const readCount = (db: SqliteDb, table: string) =>
  Number((db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count?: number } | undefined)?.count ?? 0);

const createBackupServer = async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-backup-http-'));
  const host = new RuntimeHost(join(dir, 'db.sqlite'));
  const server = createServer(createHttpHandler(host.http));
  attachWebSocketServer(server, host.ws);
  server.on('close', () => host.close());
  const port = await listen(server);
  const close = () =>
    new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())));
  return { close, dir, host, port };
};
