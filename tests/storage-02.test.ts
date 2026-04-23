import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { Storage,type NetworkInput } from '../server/storage.js';

const createNetworkInput = (overrides: Partial<NetworkInput> = {}) => ({
  templateId: null,
  managerHidden: false,
  name: 'TestNet',
  host: 'irc.example.test',
  port: 6667,
  tls: false,
  nick: 'tester',
  altNicks: ['tester_', 'tester__'],
  username: 'tester',
  realName: 'Tester Example',
  favorite: false,
  autoJoin: [],
  ...overrides,
});

const createConnectionInstance = (storage: Storage, overrides: Partial<NetworkInput> = {}) => {
  const template = storage.networks.upsert(createNetworkInput({
    name: overrides.name ?? 'TemplateNet',
    host: overrides.host ?? 'irc.example.test',
    port: overrides.port ?? 6667,
    tls: overrides.tls ?? false,
  }));
  return storage.networks.upsert(createNetworkInput({
    templateId: template.id,
    managerHidden: true,
    name: overrides.name ?? template.name,
    host: overrides.host ?? template.host,
    port: overrides.port ?? template.port,
    tls: overrides.tls ?? template.tls,
    nick: overrides.nick ?? template.nick,
    altNicks: overrides.altNicks ?? template.altNicks,
    username: overrides.username ?? template.username,
    realName: overrides.realName ?? template.realName,
    favorite: overrides.favorite ?? template.favorite,
    autoJoin: overrides.autoJoin ?? template.autoJoin,
  }));
};

test('friends persist and deduplicate case-insensitively', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-storage-'));
  const file = join(dir, 'db.sqlite');
  const storage = new Storage(file);

  const friend = storage.friends.upsert({ nick: 'Alice' });
  const duplicate = storage.friends.upsert({ nick: 'alice' });
  storage.close();

  const reopened = new Storage(file);
  const friends = reopened.friends.list();

  assert.equal(duplicate.id, friend.id);
  assert.deepEqual(friends, [friend]);

  const removed = reopened.friends.remove(friend.id);
  assert.equal(removed?.id, friend.id);
  assert.deepEqual(reopened.friends.list(), []);
});

test('deleting a template removes hidden clones', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-storage-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const template = storage.networks.upsert(createNetworkInput({
    name: 'TemplateNet',
    nick: 'templated',
    altNicks: ['templated_', 'templated__'],
    username: 'templated',
    realName: 'templated',
  }));

  storage.networks.upsert(createNetworkInput({
    templateId: template.id,
    managerHidden: true,
    name: 'TemplateNet clone',
    nick: 'templated',
    altNicks: ['templated_', 'templated__'],
    username: 'templated',
    realName: 'templated',
  }));

  assert.equal(
    storage.networks.list().filter((network) => network.id === template.id || network.templateId === template.id).length,
    2
  );
  storage.networks.delete(template.id);
  assert.equal(storage.networks.list().some((network) => network.id === template.id), false);
  assert.equal(storage.networks.list().some((network) => network.templateId === template.id), false);
});

test('connection instances can be closed without deleting stored logs', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-storage-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const network = createConnectionInstance(storage);
  storage.conversations.appendMessage({
    id: 'message-1',
    networkId: network.id,
    target: 'server',
    nick: null,
    body: 'still here',
    kind: 'system',
    self: true,
    ts: 1,
  });

  const closed = storage.networks.setConnectionClosed(network.id, true);

  assert.equal(closed?.connectionClosed, true);
  assert.equal(storage.networks.get(network.id)?.connectionClosed, true);
  assert.deepEqual(storage.conversations.listMessages(network.id, 'server', 10).map((message) => message.body), ['still here']);
});

test('query buffers persist and can be closed', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-storage-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const network = createConnectionInstance(storage);

  const query = storage.conversations.upsertQuery(network.id, 'helper');
  assert.equal(storage.conversations.listBuffers(network.id).filter((buffer) => buffer.kind === 'query').length, 1);
  assert.equal(storage.snapshot().buffers.some((buffer) => buffer.id === query.id), true);

  storage.conversations.removeBuffer(query.id);
  assert.deepEqual(storage.conversations.listBuffers(network.id).filter((buffer) => buffer.kind === 'query'), []);
  assert.equal(storage.snapshot().buffers.some((buffer) => buffer.id === query.id), false);
});
