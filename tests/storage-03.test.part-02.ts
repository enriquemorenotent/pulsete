import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
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
    workspaceOpen: true,
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

test('message history preserves insertion order when timestamps match', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-storage-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const network = createConnectionInstance(storage);
  const ts = Date.now();
  const first = storage.conversations.appendMessage({
    id: randomUUID(),
    networkId: network.id,
    target: '#help',
    nick: 'alice',
    body: 'first',
    kind: 'line',
    self: false,
    ts,
  });
  const second = storage.conversations.appendMessage({
    id: randomUUID(),
    networkId: network.id,
    target: '#help',
    nick: 'bob',
    body: 'second',
    kind: 'line',
    self: false,
    ts,
  });

  assert.deepEqual(
    storage.conversations.listMessages(network.id, '#help', 10).map((message) => message.body),
    [first.body, second.body]
  );
  assert.deepEqual(
    storage.conversations.listRecentMessages(10).slice(-2).map((message) => message.body),
    [first.body, second.body]
  );
});

test('search helpers stay scoped to the selected transcript and expose stable evidence windows', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-storage-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const network = createConnectionInstance(storage);
  const first = storage.conversations.appendMessage({
    id: 'missd-1',
    networkId: network.id,
    target: 'MissD',
    nick: 'MissD',
    body: 'Maybe I wait in the hotel bar first.',
    kind: 'line',
    self: false,
    ts: 1,
  });
  const second = storage.conversations.appendMessage({
    id: 'missd-2',
    networkId: network.id,
    target: 'missd',
    nick: 'tester',
    body: 'Then you find me in the hotel room on all 4s.',
    kind: 'line',
    self: true,
    ts: 2,
  });
  const third = storage.conversations.appendMessage({
    id: 'missd-3',
    networkId: network.id,
    target: 'MISSD',
    nick: 'MissD',
    body: 'That hotel fantasy is vivid.',
    kind: 'line',
    self: false,
    ts: 3,
  });
  storage.conversations.appendMessage({
    id: 'other-1',
    networkId: network.id,
    target: 'MissProxima',
    nick: 'MissProxima',
    body: 'Unrelated hotel idea in another query.',
    kind: 'line',
    self: false,
    ts: 4,
  });

  const matches = storage.conversations.searchMessages(network.id, 'missd', 'hotel', 10);

  assert.deepEqual(matches.map((match) => match.message.id).sort(), ['missd-1', 'missd-2', 'missd-3']);
  assert.deepEqual(storage.conversations.listOpeningMessages(network.id, 'MISSD', 2), [first, second]);
  assert.deepEqual(storage.conversations.getMessageWindow(second.id, 1, 1), [first, second, third]);
});

test('deleteMessagesByIdPrefixes removes matching rows without touching normal messages', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-storage-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const network = createConnectionInstance(storage);
  const preserved = storage.conversations.appendMessage({
    id: 'message-keep',
    networkId: network.id,
    target: '#help',
    nick: 'alice',
    body: 'keep me',
    kind: 'line',
    self: false,
    ts: 1,
  });
  const matched = storage.conversations.appendMessage({
    id: 'rollback:turn-1:0',
    networkId: network.id,
    target: '#help',
    nick: 'bob',
    body: 'delete me',
    kind: 'line',
    self: false,
    ts: 2,
  });
  storage.conversations.appendMessage({
    id: 'rollback:turn-2:0',
    networkId: network.id,
    target: '#help',
    nick: 'charlie',
    body: 'delete me too',
    kind: 'line',
    self: false,
    ts: 3,
  });

  const deleted = storage.conversations.deleteMessagesByIdPrefixes(['rollback:turn-1:', 'rollback:turn-2:']);

  assert.deepEqual(deleted.map((message) => message.id), ['rollback:turn-1:0', 'rollback:turn-2:0']);
  assert.deepEqual(storage.conversations.listMessages(network.id, '#help', 10), [preserved]);
  assert.equal(storage.conversations.getMessageById(matched.id), null);
});

test('searchMessages stays in sync when transcript rows are deleted', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-storage-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const network = createConnectionInstance(storage);
  storage.conversations.appendMessage({
    id: 'rollback:turn-1:0',
    networkId: network.id,
    target: 'Alice',
    nick: 'alice',
    body: 'The hotel fantasy starts here.',
    kind: 'line',
    self: false,
    ts: 1,
  });
  storage.conversations.appendMessage({
    id: 'message-keep',
    networkId: network.id,
    target: 'Alice',
    nick: 'tester',
    body: 'ordinary follow-up',
    kind: 'line',
    self: true,
    ts: 2,
  });

  assert.deepEqual(
    storage.conversations.searchMessages(network.id, 'alice', 'hotel', 10).map((match) => match.message.id),
    ['rollback:turn-1:0'],
  );

  storage.conversations.deleteMessagesByIdPrefixes(['rollback:turn-1:']);

  assert.deepEqual(storage.conversations.searchMessages(network.id, 'alice', 'hotel', 10), []);

  storage.conversations.appendMessage({
    id: 'message-2',
    networkId: network.id,
    target: 'alice',
    nick: 'alice',
    body: 'Another hotel clue appears later.',
    kind: 'line',
    self: false,
    ts: 3,
  });
  assert.deepEqual(
    storage.conversations.searchMessages(network.id, 'ALICE', 'hotel', 10).map((match) => match.message.id),
    ['message-2'],
  );

  storage.conversations.deleteMessages(network.id, 'Alice');

  assert.deepEqual(storage.conversations.searchMessages(network.id, 'alice', 'hotel', 10), []);
});
