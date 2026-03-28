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

test('deleteMessagesByIdPrefixes removes imported logs without touching normal messages', () => {
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
  const imported = storage.conversations.appendMessage({
    id: 'import:turn-1:0',
    networkId: network.id,
    target: '#help',
    nick: 'bob',
    body: 'delete me',
    kind: 'line',
    self: false,
    ts: 2,
  });
  storage.conversations.appendMessage({
    id: 'import:turn-2:0',
    networkId: network.id,
    target: '#help',
    nick: 'charlie',
    body: 'delete me too',
    kind: 'line',
    self: false,
    ts: 3,
  });

  const deleted = storage.conversations.deleteMessagesByIdPrefixes(['import:turn-1:', 'import:turn-2:']);

  assert.deepEqual(deleted.map((message) => message.id), ['import:turn-1:0', 'import:turn-2:0']);
  assert.deepEqual(storage.conversations.listMessages(network.id, '#help', 10), [preserved]);
  assert.equal(storage.conversations.getMessageById(imported.id), null);
});

test('searchMessages stays in sync when transcript rows are deleted', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-storage-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const network = createConnectionInstance(storage);
  storage.conversations.appendMessage({
    id: 'import:turn-1:0',
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
    ['import:turn-1:0'],
  );

  storage.conversations.deleteMessagesByIdPrefixes(['import:turn-1:']);

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

test('deleteMessages removes all transcript rows for a matched buffer target', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-storage-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const network = createConnectionInstance(storage);
  storage.conversations.appendMessage({
    id: 'keep-server',
    networkId: network.id,
    target: 'server',
    nick: null,
    body: 'server line',
    kind: 'system',
    self: false,
    ts: 1,
  });
  storage.conversations.appendMessage({
    id: 'delete-1',
    networkId: network.id,
    target: 'Alice',
    nick: 'alice',
    body: 'hello',
    kind: 'line',
    self: false,
    ts: 2,
  });
  storage.conversations.appendMessage({
    id: 'delete-2',
    networkId: network.id,
    target: 'alice',
    nick: 'alice',
    body: 'world',
    kind: 'line',
    self: false,
    ts: 3,
  });

  const deleted = storage.conversations.deleteMessages(network.id, 'ALICE');

  assert.deepEqual(deleted.map((message) => message.id), ['delete-1', 'delete-2']);
  assert.deepEqual(storage.conversations.listMessages(network.id, 'alice', 10), []);
  assert.equal(storage.conversations.getMessageById('keep-server')?.body, 'server line');
});

test('buffer upserts reuse case-insensitive query and channel ids', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-storage-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const network = createConnectionInstance(storage);

  const query = storage.conversations.upsertQuery(network.id, 'Alice');
  const queryUpdate = storage.conversations.upsertQuery(network.id, 'alice');
  assert.equal(queryUpdate.id, query.id);
  assert.equal(queryUpdate.target, 'alice');
  assert.equal(storage.conversations.listBuffers(network.id).filter((buffer) => buffer.kind === 'query').length, 1);

  const channel = storage.conversations.upsertChannel({
    networkId: network.id,
    name: '#Help',
    topic: 'Original topic',
    unread: 2,
    users: [makeUser('alice')],
  });
  const channelUpdate = storage.conversations.upsertChannel({
    networkId: network.id,
    name: '#help',
    topic: 'Updated topic',
  });
  assert.equal(channelUpdate.id, channel.id);
  assert.equal(channelUpdate.name, '#help');
  assert.equal(channelUpdate.topic, 'Updated topic');
  assert.equal(storage.conversations.getBuffer(channel.id)?.target, '#help');
  assert.equal(storage.conversations.listChannels(network.id).length, 1);
});

test('storage rejects invalid template relationships', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-storage-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const template = storage.networks.upsert(createNetworkInput({
    name: 'TemplateNet',
  }));

  assert.throws(
    () =>
      storage.networks.upsert(createNetworkInput({
        ...template,
        id: undefined,
        templateId: template.id,
        managerHidden: false,
        name: 'Visible clone',
      })),
    /Saved networks cannot reference a template/
  );
  assert.throws(
    () =>
      storage.networks.upsert(createNetworkInput({
        ...template,
        id: undefined,
        templateId: null,
        managerHidden: true,
        name: 'Orphan instance',
      })),
    /Connection instances must reference an existing saved network/
  );
  assert.throws(
    () =>
      storage.networks.upsert(createNetworkInput({
        ...template,
        id: undefined,
        templateId: 'missing-template',
        managerHidden: true,
        name: 'Broken instance',
      })),
    /Connection instances must reference an existing saved network/
  );
});
