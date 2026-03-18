import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { Storage } from '../server/storage.js';

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
