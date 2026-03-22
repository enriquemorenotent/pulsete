import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { Storage,type NetworkInput } from '../server/storage.js';
import type { ChannelUserState } from '../shared/protocol.js';

const makeUser = (nick: string, mode: ChannelUserState['mode'] = 'normal'): ChannelUserState => ({
  nick,
  mode,
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
