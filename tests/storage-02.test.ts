import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { Storage,type NetworkInput } from '../server/storage.js';

const createNetworkInput = (overrides: Partial<NetworkInput> = {}) => ({
  workspaceOpen: false,
  name: 'TestNet',
  host: 'irc.example.test',
  port: 6667,
  tls: false,
  nick: 'tester',
  altNicks: ['tester_', 'tester__'],
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
    workspaceOpen: true,
    name: overrides.name ?? template.name,
    host: overrides.host ?? template.host,
    port: overrides.port ?? template.port,
    tls: overrides.tls ?? template.tls,
    nick: overrides.nick ?? template.nick,
    altNicks: overrides.altNicks ?? template.altNicks,
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
  assert.equal(friends.length, 1);
  assert.equal(friends[0]?.id, friend.id);
  assert.equal(friends[0]?.nick, 'Alice');

  const removed = reopened.friends.remove(friend.id);
  assert.equal(removed?.id, friend.id);
  assert.deepEqual(reopened.friends.list(), []);
});

test('nick emoji tags persist per network and deduplicate case-insensitively', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-storage-'));
  const file = join(dir, 'db.sqlite');
  const storage = new Storage(file);
  const firstNetwork = createConnectionInstance(storage, { name: 'FirstNet', host: 'irc.first.test' });
  const secondNetwork = createConnectionInstance(storage, { name: 'SecondNet', host: 'irc.second.test' });

  const tagged = storage.nickEmojis.upsert({
    networkId: firstNetwork.id,
    nick: 'Alice',
    emoji: '🌙',
  });
  const updated = storage.nickEmojis.upsert({
    networkId: firstNetwork.id,
    nick: 'alice',
    emoji: '⭐',
  });
  const otherNetworkTag = storage.nickEmojis.upsert({
    networkId: secondNetwork.id,
    nick: 'Alice',
    emoji: '🔥',
  });
  storage.close();

  const reopened = new Storage(file);
  assert.equal(updated.id, tagged.id);
  assert.notEqual(otherNetworkTag.id, tagged.id);
  assert.deepEqual(reopened.nickEmojis.list(firstNetwork.id), [{
    id: tagged.id,
    networkId: firstNetwork.id,
    nick: 'alice',
    emoji: '⭐',
  }]);
  assert.deepEqual(reopened.nickEmojis.list(secondNetwork.id), [{
    id: otherNetworkTag.id,
    networkId: secondNetwork.id,
    nick: 'Alice',
    emoji: '🔥',
  }]);
});

test('deleting a network leaves other saved networks alone', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-storage-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const first = storage.networks.upsert(createNetworkInput({
    name: 'TemplateNet',
    nick: 'templated',
    altNicks: ['templated_', 'templated__'],
    realName: 'templated',
  }));

  const second = storage.networks.upsert(createNetworkInput({
    workspaceOpen: true,
    name: 'TemplateNet clone',
    nick: 'templated',
    altNicks: ['templated_', 'templated__'],
    realName: 'templated',
  }));

  assert.equal(
    storage.networks.list().filter((network) => network.id === first.id || network.id === second.id).length,
    2,
  );
  storage.networks.delete(first.id);
  assert.equal(storage.networks.list().some((network) => network.id === first.id), false);
  assert.equal(storage.networks.list().some((network) => network.id === second.id), true);
});

test('workspace networks can be closed without deleting stored logs', () => {
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

  const closed = storage.networks.setWorkspaceOpen(network.id, false);

  assert.equal(closed?.workspaceOpen, false);
  assert.equal(storage.networks.get(network.id)?.workspaceOpen, false);
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
