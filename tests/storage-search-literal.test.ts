import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { Storage, type NetworkInput } from '../server/storage.js';

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

const createSearchFixture = () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-storage-search-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const network = createConnectionInstance(storage);
  const append = (id: string, body: string, ts: number, nick = 'MissD', target = 'MissD') =>
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
  const searchIds = (query: string) =>
    storage.conversations.searchMessages(network.id, 'missd', query, 10).map((match) => match.message.id);
  return { append, searchIds, storage };
};

test('searchMessages treats punctuation-heavy queries as literal text', () => {
  const { append, searchIds, storage } = createSearchFixture();
  append('message-cpp', 'c++ topic', 1);
  append('message-csharp', 'literal C# sample', 2);
  append('message-slash', '/msg command demo', 3);
  append('message-paren', 'foo(bar) baz', 4);
  append('message-quote', 'quoted "value" sample', 5);

  assert.deepEqual(searchIds('c++'), ['message-cpp']);
  assert.deepEqual(searchIds('C#'), ['message-csharp']);
  assert.deepEqual(searchIds('/msg'), ['message-slash']);
  assert.deepEqual(searchIds('foo(bar)'), ['message-paren']);
  assert.deepEqual(searchIds('"'), ['message-quote']);

  storage.close();
});

test('searchMessages requires all whitespace-separated terms anywhere in the message', () => {
  const { append, searchIds, storage } = createSearchFixture();
  append('message-exact', 'hotel room', 1);
  append('message-reversed', 'room in hotel', 2);
  append('message-hyphen', 'hotel-bar room', 3);
  append('message-hotel-only', 'hotel only', 4);
  append('message-room-only', 'room only', 5);

  assert.deepEqual(
    [...searchIds('hotel room')].sort(),
    ['message-exact', 'message-hyphen', 'message-reversed'],
  );

  storage.close();
});

test('searchMessages handles mixed short and long literal terms and unicode case-insensitive matching', () => {
  const { append, searchIds, storage } = createSearchFixture();
  append('message-csharp-room', 'literal C# room', 1);
  append('message-room-only', 'plain room', 2);
  append('message-unicode', 'MÄR example', 3);

  assert.deepEqual(searchIds('C# room'), ['message-csharp-room']);
  assert.deepEqual(searchIds('Mär'), ['message-unicode']);
  assert.deepEqual(searchIds('mÄr'), ['message-unicode']);

  storage.close();
});
