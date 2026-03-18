import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { createDatabase } from '../server/storage-db.js';
import { Storage } from '../server/storage.js';
import { hashPassword } from '../server/storage-utils.js';

const waitFor = async (predicate: () => boolean, timeoutMs = 3000) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('Timed out waiting for condition');
};

test('storage bootstrap, auth, and persistence', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-storage-'));
  const file = join(dir, 'db.sqlite');
  const storage = new Storage(file);

  assert.equal(storage.hasUsers(), false);

  const user = storage.bootstrapUser('alice', 'secret');
  assert.equal(storage.hasUsers(), true);
  assert.deepEqual(storage.authenticate('alice', 'secret'), user);

  const bob = storage.createUser('bob', 'secret2');
  assert.deepEqual(storage.authenticate('bob', 'secret2'), bob);

  const session = storage.createSession(user.id);
  assert.equal(storage.getSession(session.token)?.user.id, user.id);

  const network = storage.upsertNetwork(user.id, {
    templateId: null,
    managerHidden: false,
    name: 'Libera',
    host: 'irc.libera.chat',
    port: 6697,
    tls: true,
    nick: 'alice',
    altNicks: ['alice_', 'alice__'],
    username: 'alice',
    realName: 'Alice Example',
    password: 'secret',
    favorite: true,
    autoJoin: ['#archlinux'],
  });

  const channel = storage.upsertChannel(user.id, {
    id: randomUUID(),
    networkId: network.id,
    name: '#archlinux',
    topic: '',
    unread: 0,
    users: ['alice'],
  });

  const message = storage.appendMessage(user.id, {
    id: randomUUID(),
    networkId: network.id,
    target: '#archlinux',
    nick: 'alice',
    body: 'hello world',
    kind: 'line',
    self: true,
    ts: Date.now(),
  });

  assert.equal(storage.listNetworks(user.id).length, 1);
  assert.deepEqual(storage.listNetworks(user.id)[0]?.altNicks, ['alice_', 'alice__']);
  assert.equal(storage.listNetworks(user.id)[0]?.realName, 'Alice Example');
  assert.equal(storage.listNetworks(user.id)[0]?.favorite, true);
  assert.equal(storage.listNetworks(user.id)[0]?.managerHidden, false);
  assert.equal(storage.listChannels(user.id).length, 1);
  assert.equal(storage.listQueries(user.id).length, 0);
  assert.equal(storage.listMessages(user.id, network.id, '#archlinux').length, 1);
  assert.equal(storage.snapshot(user.id).messages.at(-1)?.id, message.id);
  assert.equal(storage.snapshot(user.id).channels.at(0)?.id, channel.id);
  assert.equal(storage.snapshot(user.id).queries.length, 0);
});

test('storage rejects blank credentials', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-storage-'));
  const file = join(dir, 'db.sqlite');
  const storage = new Storage(file);

  assert.throws(() => storage.bootstrapUser('   ', ''), /Username is required/);

  storage.bootstrapUser('alice', 'secret');
  assert.throws(() => storage.createUser('bob', ''), /Password is required/);
});

test('storage rejects usernames that cannot seed IRC-safe defaults', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-storage-'));
  const file = join(dir, 'db.sqlite');
  const storage = new Storage(file);

  assert.throws(() => storage.bootstrapUser('alice bob', 'secret'), /Username cannot contain whitespace/);

  storage.bootstrapUser('alice', 'secret');
  assert.throws(() => storage.createUser('bob ross', 'secret'), /Username cannot contain whitespace/);
});

test('legacy spaced usernames still authenticate and block canonical duplicates', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-storage-'));
  const file = join(dir, 'db.sqlite');
  const storage = new Storage(file);
  const db = new DatabaseSync(file);
  const salt = randomBytes(16).toString('hex');
  db.prepare('INSERT INTO users (id, username, passwordHash, salt, createdAt) VALUES (?, ?, ?, ?, ?)')
    .run('u1', ' alice ', hashPassword('secret', salt), salt, Date.now());
  db.close();

  assert.deepEqual(storage.authenticate('alice', 'secret'), { id: 'u1', username: ' alice ' });
  assert.throws(() => storage.createUser('alice', 'other-secret'), /Username already exists/);
});

test('legacy usernames with non-space edge whitespace authenticate and block canonical duplicates', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-storage-'));
  const file = join(dir, 'db.sqlite');
  const storage = new Storage(file);
  const db = new DatabaseSync(file);
  const salt = randomBytes(16).toString('hex');
  db.prepare('INSERT INTO users (id, username, passwordHash, salt, createdAt) VALUES (?, ?, ?, ?, ?)')
    .run('u1', '\talice\t\n', hashPassword('secret', salt), salt, Date.now());
  db.close();

  assert.deepEqual(storage.authenticate('alice', 'secret'), { id: 'u1', username: '\talice\t\n' });
  assert.throws(() => storage.createUser('alice', 'other-secret'), /Username already exists/);
});

test('legacy canonical username collisions authenticate the unique password match', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-storage-'));
  const file = join(dir, 'db.sqlite');
  const storage = new Storage(file);
  const db = new DatabaseSync(file);
  const seed = (id: string, username: string, password: string, createdAt: number) => {
    const salt = randomBytes(16).toString('hex');
    db.prepare('INSERT INTO users (id, username, passwordHash, salt, createdAt) VALUES (?, ?, ?, ?, ?)')
      .run(id, username, hashPassword(password, salt), salt, createdAt);
  };
  seed('u1', 'alice', 'pw1', 1);
  seed('u2', ' alice ', 'pw2', 2);
  db.close();

  assert.deepEqual(storage.authenticate('alice', 'pw1'), { id: 'u1', username: 'alice' });
  assert.deepEqual(storage.authenticate('alice', 'pw2'), { id: 'u2', username: ' alice ' });
  assert.deepEqual(storage.authenticate(' alice ', 'pw2'), { id: 'u2', username: ' alice ' });
});

test('default networks use canonical usernames for legacy accounts', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-storage-'));
  const file = join(dir, 'db.sqlite');
  const storage = new Storage(file);
  const db = new DatabaseSync(file);
  const salt = randomBytes(16).toString('hex');
  db.prepare('INSERT INTO users (id, username, passwordHash, salt, createdAt) VALUES (?, ?, ?, ?, ?)')
    .run('u1', ' alice ', hashPassword('secret', salt), salt, Date.now());
  db.close();

  const snapshot = storage.snapshot('u1');

  assert.equal(snapshot.user.username, ' alice ');
  assert.equal(snapshot.networks[0]?.nick, 'alice');
  assert.deepEqual(snapshot.networks[0]?.altNicks, ['alice_', 'alice__']);
  assert.equal(snapshot.networks[0]?.username, 'alice');
  assert.equal(snapshot.networks[0]?.realName, 'alice');
});

test('snapshot seeds built-in networks for empty accounts', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-storage-'));
  const file = join(dir, 'db.sqlite');
  const storage = new Storage(file);

  const user = storage.bootstrapUser('seeduser', 'secret');
  const snapshot = storage.snapshot(user.id);

  assert.deepEqual(
    snapshot.networks.map((network) => [network.name, network.host, network.port, network.tls]),
    [
      ['Libera.Chat', 'irc.libera.chat', 6697, true],
      ['OFTC', 'irc.oftc.net', 6697, true],
      ['Snoonet', 'irc.snoonet.org', 6697, true],
      ['IRCnet', 'irc.ircnet.com', 6667, false],
    ]
  );
  assert.equal(snapshot.networks[0]?.nick, 'seeduser');
  assert.deepEqual(snapshot.networks[0]?.altNicks, ['seeduser_', 'seeduser__']);
  assert.equal(snapshot.networks.every((network) => network.managerHidden === false), true);
});

test('deleting a template removes its hidden session clones', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-storage-'));
  const file = join(dir, 'db.sqlite');
  const storage = new Storage(file);

  const user = storage.bootstrapUser('templated', 'secret');
  const template = storage.upsertNetwork(user.id, {
    templateId: null,
    managerHidden: false,
    name: 'Libera.Chat',
    host: 'irc.libera.chat',
    port: 6697,
    tls: true,
    nick: 'templated',
    altNicks: ['templated_', 'templated__'],
    username: 'templated',
    realName: 'templated',
    favorite: true,
    autoJoin: [],
  });

  storage.upsertNetwork(user.id, {
    templateId: template.id,
    managerHidden: true,
    name: 'Libera.Chat',
    host: 'irc.libera.chat',
    port: 6697,
    tls: true,
    nick: 'templated',
    altNicks: ['templated_', 'templated__'],
    username: 'templated',
    realName: 'templated',
    favorite: true,
    autoJoin: [],
  });

  assert.equal(storage.listNetworks(user.id).length, 2);
  storage.deleteNetwork(user.id, template.id);
  assert.equal(storage.listNetworks(user.id).length, 0);
});

test('query buffers persist and can be closed', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-storage-'));
  const file = join(dir, 'db.sqlite');
  const storage = new Storage(file);

  const user = storage.bootstrapUser('queryuser', 'secret');
  const network = storage.upsertNetwork(user.id, {
    templateId: null,
    managerHidden: false,
    name: 'OFTC',
    host: 'irc.oftc.net',
    port: 6697,
    tls: true,
    nick: 'queryuser',
    altNicks: ['queryuser_', 'queryuser__'],
    username: 'queryuser',
    realName: 'queryuser',
    favorite: true,
    autoJoin: [],
  });

  const query = storage.upsertQuery(user.id, network.id, 'helper');
  assert.equal(storage.listQueries(user.id).length, 1);
  assert.equal(storage.snapshot(user.id).queries[0]?.id, query.id);

  storage.deleteQuery(user.id, network.id, 'helper');
  assert.equal(storage.listQueries(user.id).length, 0);
  assert.equal(storage.snapshot(user.id).queries.length, 0);
});

test('storage migrates legacy networks missing autoJoin', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-storage-'));
  const file = join(dir, 'db.sqlite');
  const db = new DatabaseSync(file);
  db.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      passwordHash TEXT NOT NULL,
      salt TEXT NOT NULL,
      createdAt INTEGER NOT NULL
    );
    CREATE TABLE networks (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      templateId TEXT,
      managerHidden INTEGER NOT NULL DEFAULT 0,
      name TEXT NOT NULL,
      host TEXT NOT NULL,
      port INTEGER NOT NULL,
      tls INTEGER NOT NULL,
      nick TEXT NOT NULL,
      altNicks TEXT NOT NULL DEFAULT '[]',
      username TEXT NOT NULL,
      realName TEXT NOT NULL DEFAULT '',
      password TEXT,
      favorite INTEGER NOT NULL DEFAULT 0,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL
    );
  `);
  db.prepare('INSERT INTO users (id, username, passwordHash, salt, createdAt) VALUES (?, ?, ?, ?, ?)')
    .run('u1', 'legacy', 'hash', 'salt', Date.now());
  db.prepare(
    `INSERT INTO networks
      (id, userId, templateId, managerHidden, name, host, port, tls, nick, altNicks, username, realName, password, favorite, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run('n1', 'u1', null, 0, 'LegacyNet', 'irc.example.test', 6667, 0, 'legacy', '[]', 'legacy', 'legacy', null, 0, Date.now(), Date.now());
  db.close();

  const storage = new Storage(file);
  assert.deepEqual(storage.listNetworks('u1')[0]?.autoJoin, []);

  const updated = storage.upsertNetwork('u1', {
    id: 'n1',
    templateId: null,
    managerHidden: false,
    name: 'LegacyNet',
    host: 'irc.example.test',
    port: 6667,
    tls: false,
    nick: 'legacy',
    altNicks: ['legacy_'],
    username: 'legacy',
    realName: 'legacy',
    favorite: false,
    autoJoin: ['#help'],
  });

  assert.deepEqual(updated.autoJoin, ['#help']);
  assert.deepEqual(storage.getNetwork('u1', 'n1')?.autoJoin, ['#help']);
});

test('storage rejects upserting another user network id', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-storage-'));
  const file = join(dir, 'db.sqlite');
  const storage = new Storage(file);
  const alice = storage.bootstrapUser('alice', 'secret');
  const bob = storage.createUser('bob', 'secret');
  const network = storage.upsertNetwork(alice.id, {
    templateId: null,
    managerHidden: false,
    name: 'AliceNet',
    host: 'alice.example.test',
    port: 6667,
    tls: false,
    nick: 'alice',
    altNicks: ['alice_'],
    username: 'alice',
    realName: 'alice',
    favorite: false,
    autoJoin: [],
  });

  assert.throws(() => storage.upsertNetwork(bob.id, {
    id: network.id,
    templateId: null,
    managerHidden: false,
    name: 'BobOverwrite',
    host: 'bob.example.test',
    port: 6697,
    tls: true,
    nick: 'bob',
    altNicks: ['bob_'],
    username: 'bob',
    realName: 'bob',
    favorite: true,
    autoJoin: ['#owned'],
  }), /Network not found/);
  assert.equal(storage.getNetwork(bob.id, network.id), null);
  assert.equal(storage.getNetwork(alice.id, network.id)?.name, 'AliceNet');
});

test('storage rejects invalid template relationships', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-storage-'));
  const file = join(dir, 'db.sqlite');
  const storage = new Storage(file);
  const user = storage.bootstrapUser('alice', 'secret');
  const template = storage.upsertNetwork(user.id, {
    templateId: null,
    managerHidden: false,
    name: 'TemplateNet',
    host: 'irc.example.test',
    port: 6667,
    tls: false,
    nick: 'alice',
    altNicks: ['alice_'],
    username: 'alice',
    realName: 'alice',
    favorite: false,
    autoJoin: [],
  });

  assert.throws(() => storage.upsertNetwork(user.id, {
    ...template,
    id: undefined,
    templateId: template.id,
    managerHidden: false,
    name: 'Visible clone',
  }), /Saved networks cannot reference a template/);

  assert.throws(() => storage.upsertNetwork(user.id, {
    ...template,
    id: undefined,
    templateId: null,
    managerHidden: true,
    name: 'Orphan instance',
  }), /Connection instances must reference an existing saved network/);

  assert.throws(() => storage.upsertNetwork(user.id, {
    ...template,
    id: undefined,
    templateId: 'missing-template',
    managerHidden: true,
    name: 'Broken instance',
  }), /Connection instances must reference an existing saved network/);
});

test('storage rejects changing a network template relationship after creation', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-storage-'));
  const file = join(dir, 'db.sqlite');
  const storage = new Storage(file);
  const user = storage.bootstrapUser('alice', 'secret');
  const template = storage.upsertNetwork(user.id, {
    templateId: null,
    managerHidden: false,
    name: 'TemplateNet',
    host: 'irc.example.test',
    port: 6667,
    tls: false,
    nick: 'alice',
    altNicks: ['alice_'],
    username: 'alice',
    realName: 'alice',
    favorite: false,
    autoJoin: [],
  });
  const otherTemplate = storage.upsertNetwork(user.id, {
    templateId: null,
    managerHidden: false,
    name: 'OtherTemplateNet',
    host: 'irc2.example.test',
    port: 6697,
    tls: true,
    nick: 'alice',
    altNicks: ['alice_'],
    username: 'alice',
    realName: 'alice',
    favorite: false,
    autoJoin: [],
  });
  const clone = storage.upsertNetwork(user.id, {
    ...template,
    id: undefined,
    templateId: template.id,
    managerHidden: true,
    name: 'Connection instance',
  });

  assert.throws(() => storage.upsertNetwork(user.id, {
    ...template,
    templateId: otherTemplate.id,
    managerHidden: true,
  }), /Network template relationship cannot be changed after creation/);

  assert.throws(() => storage.upsertNetwork(user.id, {
    ...clone,
    managerHidden: false,
    templateId: null,
  }), /Network template relationship cannot be changed after creation/);

  assert.throws(() => storage.upsertNetwork(user.id, {
    ...clone,
    templateId: otherTemplate.id,
  }), /Network template relationship cannot be changed after creation/);
});

test('network passwords stay encrypted at rest and inherit on hidden clones', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-storage-'));
  const file = join(dir, 'db.sqlite');
  const storage = new Storage(file);
  const user = storage.bootstrapUser('alice', 'secret');
  const network = storage.upsertNetwork(user.id, {
    templateId: null,
    managerHidden: false,
    name: 'SecretNet',
    host: 'irc.example.test',
    port: 6697,
    tls: true,
    nick: 'alice',
    altNicks: ['alice_', 'alice__'],
    username: 'alice',
    realName: 'Alice Example',
    password: 'server-secret',
    favorite: true,
    autoJoin: ['#ops'],
  });

  const publicProfile = storage.getNetwork(user.id, network.id);
  assert.equal(publicProfile?.hasPassword, true);
  assert.equal((publicProfile as { password?: string } | null)?.password, undefined);
  assert.equal(storage.getRuntimeNetwork(user.id, network.id)?.password, 'server-secret');

  const db = new DatabaseSync(file);
  const row = db.prepare('SELECT password FROM networks WHERE id = ?').get(network.id) as { password: string };
  db.close();
  assert.notEqual(row.password, 'server-secret');
  assert.match(row.password, /^enc-v1:/);

  const clone = storage.upsertNetwork(user.id, {
    templateId: network.id,
    managerHidden: true,
    name: `${network.name} clone`,
    host: network.host,
    port: network.port,
    tls: network.tls,
    nick: network.nick,
    altNicks: network.altNicks,
    username: network.username,
    realName: network.realName,
    favorite: network.favorite,
    autoJoin: network.autoJoin,
  });

  assert.equal(clone.hasPassword, true);
  assert.equal(storage.getRuntimeNetwork(user.id, clone.id)?.password, 'server-secret');
});

test('legacy plaintext passwords with the encryption prefix are migrated as plaintext', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-storage-'));
  const file = join(dir, 'db.sqlite');
  const db = createDatabase(file);
  db.prepare('INSERT INTO users (id, username, passwordHash, salt, createdAt) VALUES (?, ?, ?, ?, ?)')
    .run('u1', 'legacy', 'hash', 'salt', Date.now());
  db.prepare(
    `INSERT INTO networks
      (id, userId, templateId, managerHidden, name, host, port, tls, nick, altNicks, username, realName, password, favorite, autoJoin, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    'n1',
    'u1',
    null,
    0,
    'LegacyNet',
    'irc.example.test',
    6667,
    0,
    'legacy',
    '[]',
    'legacy',
    'Legacy User',
    'enc-v1:not-really-encrypted',
    0,
    '[]',
    Date.now(),
    Date.now()
  );
  db.close();

  const storage = new Storage(file);
  assert.equal(storage.getRuntimeNetwork('u1', 'n1')?.password, 'enc-v1:not-really-encrypted');
  assert.equal(existsSync(join(dir, 'pulsete.secret')), true);

  const verify = new DatabaseSync(file);
  const row = verify.prepare('SELECT password FROM networks WHERE id = ?').get('n1') as { password: string };
  verify.close();
  assert.notEqual(row.password, 'enc-v1:not-really-encrypted');
  assert.match(row.password, /^enc-v1:/);
});

test('empty string password updates preserve the existing saved password', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-storage-'));
  const file = join(dir, 'db.sqlite');
  const storage = new Storage(file);
  const user = storage.bootstrapUser('alice', 'secret');
  const network = storage.upsertNetwork(user.id, {
    templateId: null,
    managerHidden: false,
    name: 'SecretNet',
    host: 'irc.example.test',
    port: 6697,
    tls: true,
    nick: 'alice',
    altNicks: ['alice_', 'alice__'],
    username: 'alice',
    realName: 'Alice Example',
    password: 'server-secret',
    favorite: true,
    autoJoin: ['#ops'],
  });

  storage.upsertNetwork(user.id, {
    ...network,
    password: '',
  });

  assert.equal(storage.getRuntimeNetwork(user.id, network.id)?.password, 'server-secret');
});

test('storage fails fast when encrypted passwords exist but the secret key is missing', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-storage-'));
  const file = join(dir, 'db.sqlite');
  const storage = new Storage(file);
  const user = storage.bootstrapUser('alice', 'secret');
  storage.upsertNetwork(user.id, {
    templateId: null,
    managerHidden: false,
    name: 'SecretNet',
    host: 'irc.example.test',
    port: 6697,
    tls: true,
    nick: 'alice',
    altNicks: ['alice_', 'alice__'],
    username: 'alice',
    realName: 'Alice Example',
    password: 'server-secret',
    favorite: true,
    autoJoin: ['#ops'],
  });

  unlinkSync(join(dir, 'pulsete.secret'));

  assert.throws(() => new Storage(file), /Missing network secret key/);
});

test('expired sessions are rejected and cleaned up', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-storage-'));
  const file = join(dir, 'db.sqlite');
  const storage = new Storage(file);
  const user = storage.bootstrapUser('alice', 'secret');
  const db = new DatabaseSync(file);

  db.prepare('INSERT INTO sessions (token, userId, createdAt, expiresAt) VALUES (?, ?, ?, ?)')
    .run('expired-token', user.id, Date.now() - 2_000, Date.now() - 1_000);
  db.prepare('INSERT INTO sessions (token, userId, createdAt, expiresAt) VALUES (?, ?, ?, ?)')
    .run('still-valid', user.id, Date.now(), Date.now() + 60_000);
  db.prepare('INSERT INTO sessions (token, userId, createdAt, expiresAt) VALUES (?, ?, ?, ?)')
    .run('cleanup-token', user.id, Date.now() - 2_000, Date.now() - 1_000);
  db.close();

  assert.equal(storage.getSession('expired-token'), null);
  assert.equal(storage.getSession('still-valid')?.user.id, user.id);

  storage.deleteExpiredSessions();

  const verify = new DatabaseSync(file);
  const remainingExpired = verify.prepare('SELECT COUNT(*) AS count FROM sessions WHERE token IN (?, ?)')
    .get('expired-token', 'cleanup-token') as { count: number };
  const remainingValid = verify.prepare('SELECT COUNT(*) AS count FROM sessions WHERE token = ?')
    .get('still-valid') as { count: number };
  verify.close();

  assert.equal(remainingExpired.count, 0);
  assert.equal(remainingValid.count, 1);
});

test('storage periodically removes expired sessions without direct access', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-storage-'));
  const file = join(dir, 'db.sqlite');
  const storage = new Storage(file, { sessionCleanupIntervalMs: 25 });
  const user = storage.bootstrapUser('alice', 'secret');
  const db = new DatabaseSync(file);

  db.prepare('INSERT INTO sessions (token, userId, createdAt, expiresAt) VALUES (?, ?, ?, ?)')
    .run('background-expired', user.id, Date.now() - 2_000, Date.now() - 1_000);
  db.close();

  await waitFor(() => {
    const verify = new DatabaseSync(file);
    const count = (verify.prepare('SELECT COUNT(*) AS count FROM sessions WHERE token = ?')
      .get('background-expired') as { count: number }).count;
    verify.close();
    return count === 0;
  });
});

test('storage close stops background cleanup work', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-storage-'));
  const file = join(dir, 'db.sqlite');
  const storage = new Storage(file, { sessionCleanupIntervalMs: 25 });
  const user = storage.bootstrapUser('alice', 'secret');
  const db = new DatabaseSync(file);

  db.prepare('INSERT INTO sessions (token, userId, createdAt, expiresAt) VALUES (?, ?, ?, ?)')
    .run('background-expired', user.id, Date.now() - 2_000, Date.now() - 1_000);
  db.close();

  storage.close();
  storage.close();

  await new Promise((resolve) => setTimeout(resolve, 100));

  const verify = new DatabaseSync(file);
  const count = (verify.prepare('SELECT COUNT(*) AS count FROM sessions WHERE token = ?')
    .get('background-expired') as { count: number }).count;
  verify.close();

  assert.equal(count, 1);
});
