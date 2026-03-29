import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { Storage,type NetworkInput } from '../server/storage.js';
import type { ChannelUserState } from '../shared/protocol.js';

const makeUser = (
  nick: string,
  mode: ChannelUserState['mode'] = 'normal',
  away = false,
): ChannelUserState => ({
  nick,
  mode,
  away,
});

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

test('query buffers and history match IRC nick casing insensitively', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-storage-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const network = createConnectionInstance(storage);
  const query = storage.conversations.upsertQuery(network.id, 'Alice');
  const message = storage.conversations.appendMessage({
    id: randomUUID(),
    networkId: network.id,
    target: 'alice',
    nick: 'alice',
    body: 'hello there',
    kind: 'line',
    self: false,
    ts: Date.now(),
  });

  assert.equal(storage.conversations.getBufferByTarget(network.id, 'ALICE')?.id, query.id);
  assert.deepEqual(storage.conversations.listMessages(network.id, 'ALICE', 10), [message]);
});

test('query alias repairs stay scoped to the selected private chat', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-storage-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const network = createConnectionInstance(storage, {
    nick: 'sofia',
    altNicks: ['sofia_', 'sofia__'],
  });
  const missdBuffer = storage.conversations.upsertQuery(network.id, 'MissD');
  storage.conversations.upsertQuery(network.id, 'sofiaIsBack');

  storage.conversations.appendMessage({
    id: 'missd-imported',
    networkId: network.id,
    target: 'MissD',
    nick: 'sofiaIsBack',
    speakerRole: 'unknown',
    speakerNick: 'sofiaIsBack',
    attributionSource: 'unknown',
    attributionConfidence: 'low',
    body: 'old imported self line',
    kind: 'line',
    self: false,
    ts: 1,
  });
  storage.conversations.appendMessage({
    id: 'other-query-imported',
    networkId: network.id,
    target: 'sofiaIsBack',
    nick: 'sofiaIsBack',
    speakerRole: 'unknown',
    speakerNick: 'sofiaIsBack',
    attributionSource: 'unknown',
    attributionConfidence: 'low',
    body: 'future peer line with the same nick',
    kind: 'line',
    self: false,
    ts: 2,
  });

  const repaired = storage.conversations.repairBufferMessageAttributions({
    bufferKind: 'query',
    networkId: network.id,
    target: 'MissD',
    nick: network.nick,
    altNicks: network.altNicks,
    selfNickAliases: ['sofiaIsBack'],
  });

  assert.deepEqual(repaired.map((message) => message.id), ['missd-imported']);
  assert.equal(storage.conversations.getMessageById('missd-imported')?.speakerRole, 'self');
  assert.equal(storage.conversations.getMessageById('missd-imported')?.attributionSource, 'query-alias');
  assert.equal(storage.conversations.getMessageById('missd-imported')?.self, true);
  assert.equal(storage.conversations.getMessageById('other-query-imported')?.speakerRole, 'unknown');
  assert.equal(storage.conversations.getMessageById('other-query-imported')?.speakerNick, 'sofiaIsBack');
  assert.equal(storage.conversations.getMessageById('other-query-imported')?.attributionSource, 'unknown');
  assert.equal(storage.conversations.getMessageById('other-query-imported')?.self, false);
});

test('channel alias repairs update only the selected channel history', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-storage-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const network = createConnectionInstance(storage, {
    nick: 'sofia',
    altNicks: ['sofia_', 'sofia__'],
  });
  storage.conversations.upsertChannel({
    networkId: network.id,
    name: '#lesdomme',
    topic: '',
    users: [],
  });
  storage.conversations.upsertChannel({
    networkId: network.id,
    name: '#other',
    topic: '',
    users: [],
  });

  storage.conversations.appendMessage({
    id: 'channel-imported',
    networkId: network.id,
    target: '#lesdomme',
    nick: 'oldsofia',
    speakerRole: 'other',
    speakerNick: 'oldsofia',
    attributionSource: 'unknown',
    attributionConfidence: 'low',
    body: 'old imported self line',
    kind: 'line',
    self: false,
    ts: 1,
  });
  storage.conversations.appendMessage({
    id: 'other-channel-imported',
    networkId: network.id,
    target: '#other',
    nick: 'oldsofia',
    speakerRole: 'other',
    speakerNick: 'oldsofia',
    attributionSource: 'unknown',
    attributionConfidence: 'low',
    body: 'same nick in another channel',
    kind: 'line',
    self: false,
    ts: 2,
  });

  const repaired = storage.conversations.repairBufferMessageAttributions({
    bufferKind: 'channel',
    networkId: network.id,
    target: '#lesdomme',
    nick: network.nick,
    altNicks: network.altNicks,
    selfNickAliases: ['oldsofia'],
  });

  assert.deepEqual(repaired.map((message) => message.id), ['channel-imported']);
  assert.equal(storage.conversations.getMessageById('channel-imported')?.speakerRole, 'self');
  assert.equal(storage.conversations.getMessageById('channel-imported')?.attributionSource, 'import-alias');
  assert.equal(storage.conversations.getMessageById('channel-imported')?.self, true);
  assert.equal(storage.conversations.getMessageById('other-channel-imported')?.speakerRole, 'other');
  assert.equal(storage.conversations.getMessageById('other-channel-imported')?.attributionSource, 'unknown');
  assert.equal(storage.conversations.getMessageById('other-channel-imported')?.self, false);
});

test('unknown network filters do not fall back to global buffers or channels', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-storage-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const network = createConnectionInstance(storage);

  storage.conversations.upsertQuery(network.id, 'helper');
  storage.conversations.upsertChannel({
    networkId: network.id,
    name: '#help',
    topic: 'Support',
    users: [makeUser('alice')],
  });

  assert.deepEqual(storage.conversations.listBuffers('missing-network'), []);
  assert.deepEqual(storage.conversations.listChannels('missing-network'), []);
});

