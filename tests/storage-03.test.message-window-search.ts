import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { Storage, type NetworkInput } from '../server/storage.js';


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

test('message window helpers stay scoped to the selected transcript', () => {
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

  assert.deepEqual(storage.conversations.listOpeningMessages(network.id, 'MISSD', 2), [first, second]);
  assert.deepEqual(storage.conversations.getMessageWindow(second.id, 1, 1), [first, second, third]);
});

test('message history search stays literal and scoped to the selected buffer', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-storage-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const network = createConnectionInstance(storage);
  const buffer = storage.conversations.upsertQuery(network.id, 'MissD');
  const append = (id: string, body: string, ts: number, target = 'MissD', nick: string | null = 'MissD') =>
    storage.conversations.appendMessage({
      id,
      networkId: network.id,
      target,
      nick,
      body,
      kind: 'line',
      self: false,
      ts,
    });
  append('message-cpp', 'c++ topic', 1);
  append('message-csharp', 'literal C# room', 2);
  append('message-hotel-room', 'room in hotel', 3);
  append('message-unicode', 'MÄR example', 4);
  append('message-nick', 'plain body', 5, 'MissD', 'Alice');
  storage.conversations.appendMessage({
    id: 'message-speaker',
    networkId: network.id,
    target: 'MissD',
    nick: null,
    speakerRole: 'self',
    speakerNick: 'Sofia',
    attributionSource: 'runtime',
    attributionConfidence: 'high',
    body: 'speaker only',
    kind: 'line',
    self: true,
    ts: 6,
  });
  append('message-cap-new', 'cap me', 8);
  append('message-cap-old', 'cap me', 0);
  append('other-buffer', 'c++ topic in another query', 7, 'MissProxima');

  const searchIds = (query: string, limit = 10) =>
    storage.conversations.searchMessagesByBufferId(buffer.id, query, limit).messages.map((message) => message.id);

  assert.deepEqual(searchIds('c++'), ['message-cpp']);
  assert.deepEqual(searchIds('C# room'), ['message-csharp']);
  assert.deepEqual(searchIds('hotel room'), ['message-hotel-room']);
  assert.deepEqual(searchIds('ote'), ['message-hotel-room']);
  assert.deepEqual(searchIds('mÄr'), ['message-unicode']);
  assert.deepEqual(searchIds('alice'), ['message-nick']);
  assert.deepEqual(searchIds('alice plain'), ['message-nick']);
  assert.deepEqual(searchIds('sofia'), ['message-speaker']);

  const capped = storage.conversations.searchMessagesByBufferId(buffer.id, 'cap', 1);
  assert.deepEqual(capped.messages.map((message) => message.id), ['message-cap-new']);
  assert.equal(capped.hasMore, true);

  storage.conversations.deleteMessagesByIdPrefixes(['message-hotel']);
  assert.deepEqual(searchIds('hotel'), []);
});

test('message history search can scan all stored logs with filters', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-storage-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const firstNetwork = createConnectionInstance(storage, { name: 'FirstNet' });
  const secondNetwork = createConnectionInstance(storage, { name: 'SecondNet', host: 'irc2.example.test' });
  const append = (
    id: string,
    networkId: string,
    target: string,
    body: string,
    ts: number,
  ) =>
    storage.conversations.appendMessage({
      id,
      networkId,
      target,
      nick: 'alice',
      body,
      kind: 'line',
      self: false,
      ts,
    });

  append('first-old', firstNetwork.id, '#help', 'needle in old channel', 1);
  append('first-new', firstNetwork.id, 'MissD', 'needle in private log', 5);
  append('first-server', firstNetwork.id, 'server', 'needle from server log', 4);
  append('second-hit', secondNetwork.id, '#help', 'needle on another network', 6);
  append('miss', firstNetwork.id, '#help', 'unrelated', 7);

  const searchIds = (filters = {}) =>
    storage.conversations.searchMessages('needle', 10, filters).messages.map((message) => message.id);

  assert.deepEqual(searchIds(), ['second-hit', 'first-new', 'first-server', 'first-old']);
  assert.deepEqual(searchIds({ networkId: firstNetwork.id }), ['first-new', 'first-server', 'first-old']);
  assert.deepEqual(searchIds({ target: '#help' }), ['second-hit', 'first-old']);
  assert.deepEqual(searchIds({ networkId: firstNetwork.id, target: 'server' }), ['first-server']);

  const capped = storage.conversations.searchMessages('needle', 1);
  assert.deepEqual(capped.messages.map((message) => message.id), ['second-hit']);
  assert.equal(capped.hasMore, true);
});

test('log source listing includes closed channel and PM logs by alias', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-storage-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const firstNetwork = createConnectionInstance(storage, { name: 'FirstNet' });
  const secondNetwork = createConnectionInstance(storage, { name: 'SecondNet', host: 'irc2.example.test' });

  storage.conversations.appendMessage({
    id: 'closed-channel',
    networkId: firstNetwork.id,
    target: '#OldRoom',
    nick: 'alice',
    body: 'old channel log',
    kind: 'line',
    self: false,
    ts: 10,
  });
  storage.conversations.appendMessage({
    id: 'query-before-rename',
    networkId: firstNetwork.id,
    target: 'MissD',
    nick: 'MissD',
    body: 'private log',
    kind: 'line',
    self: false,
    ts: 20,
  });
  storage.conversations.recordObservedQueryNickChange(firstNetwork.id, 'MissD', 'Guide');
  storage.conversations.appendMessage({
    id: 'other-network-channel',
    networkId: secondNetwork.id,
    target: '#OldRoom',
    nick: 'bob',
    body: 'other network log',
    kind: 'line',
    self: false,
    ts: 30,
  });
  storage.conversations.upsertBuffer({
    networkId: firstNetwork.id,
    kind: 'channel',
    target: '#empty',
  });
  storage.conversations.appendMessage({
    id: 'server-log',
    networkId: firstNetwork.id,
    target: 'server',
    nick: null,
    body: 'server log',
    kind: 'system',
    self: false,
    ts: 40,
  });

  const allSources = storage.conversations.listLogSources({}, 10);
  assert.deepEqual(allSources.map((source) => source.buffer.target), ['#OldRoom', 'Guide', '#OldRoom']);
  assert.deepEqual(allSources.map((source) => source.buffer.kind), ['channel', 'query', 'channel']);
  assert.equal(allSources.some((source) => source.buffer.target === '#empty'), false);
  assert.equal(allSources.some((source) => source.buffer.target === 'server'), false);

  const aliasMatch = storage.conversations.listLogSources({ q: 'missd' }, 10);
  assert.deepEqual(aliasMatch.map((source) => ({
    aliases: source.aliases,
    target: source.buffer.target,
  })), [{ aliases: ['MissD'], target: 'Guide' }]);

  assert.deepEqual(
    storage.conversations.listLogSources({ networkId: firstNetwork.id, kind: 'channel' }, 10)
      .map((source) => source.buffer.target),
    ['#OldRoom'],
  );
  assert.deepEqual(
    storage.conversations.listLogSources({ q: 'oldroom' }, 1)
      .map((source) => source.buffer.networkId),
    [secondNetwork.id],
  );
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
