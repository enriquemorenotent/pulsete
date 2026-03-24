import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { handleRuntimeEvent } from '../server/runtime-events.js';
import { Storage } from '../server/storage.js';
import { createNetworkInput,makeUser } from './helpers/runtime-test-common.js';

test('incoming private messages open query buffers automatically', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const network = storage.networks.upsert(createNetworkInput());
  const sent: Array<{ type: string; [key: string]: unknown }> = [];

  handleRuntimeEvent(
    { store: storage, publish(message) { sent.push(message); } },
    {
      type: 'message',
      message: {
        id: randomUUID(),
        networkId: network.id,
        target: 'helper',
        nick: 'helper',
        body: 'hello there',
        kind: 'line',
        self: false,
        ts: Date.now(),
      },
    }
  );

  assert.equal(storage.conversations.getBufferByTarget(network.id, 'helper')?.target, 'helper');
  assert.ok(sent.some((message) => message.type === 'message.append'));
  assert.deepEqual(sent.find((message) => message.type === 'buffer.upsert'), {
    type: 'buffer.upsert',
    buffer: storage.conversations.getBufferByTarget(network.id, 'helper'),
  });
});

test('incoming private messages reuse an existing query buffer across IRC nick casing', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const network = storage.networks.upsert(createNetworkInput());
  const existingQuery = storage.conversations.upsertQuery(network.id, 'Alice');
  const sent: Array<{ type: string; [key: string]: unknown }> = [];

  handleRuntimeEvent(
    { store: storage, publish(message) { sent.push(message); } },
    {
      type: 'message',
      message: {
        id: randomUUID(),
        networkId: network.id,
        target: 'alice',
        nick: 'alice',
        body: 'hello again',
        kind: 'line',
        self: false,
        ts: Date.now(),
      },
    }
  );

  assert.equal(storage.conversations.listBuffers(network.id).filter((buffer) => buffer.kind === 'query').length, 1);
  assert.equal(storage.conversations.getBufferByTarget(network.id, 'ALICE')?.id, existingQuery.id);
  assert.deepEqual(sent.find((message) => message.type === 'buffer.upsert'), {
    type: 'buffer.upsert',
    buffer: storage.conversations.getBuffer(existingQuery.id),
  });
});

test('self-sent private messages open query buffers automatically', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const network = storage.networks.upsert(createNetworkInput());
  const sent: Array<{ type: string; [key: string]: unknown }> = [];

  handleRuntimeEvent(
    { store: storage, publish(message) { sent.push(message); } },
    {
      type: 'message',
      message: {
        id: randomUUID(),
        networkId: network.id,
        target: 'helper',
        nick: 'tester',
        body: 'hello there',
        kind: 'line',
        self: true,
        ts: Date.now(),
      },
    }
  );

  assert.equal(storage.conversations.getBufferByTarget(network.id, 'helper')?.kind, 'query');
  assert.ok(sent.some((message) => message.type === 'message.append'));
  assert.equal(
    sent.some((message) => {
      const buffer = message.buffer as { kind?: string } | undefined;
      return message.type === 'buffer.upsert' && buffer?.kind === 'query';
    }),
    true
  );
});

test('private action messages open query buffers automatically', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const network = storage.networks.upsert(createNetworkInput());
  const sent: Array<{ type: string; [key: string]: unknown }> = [];

  handleRuntimeEvent(
    { store: storage, publish(message) { sent.push(message); } },
    {
      type: 'message',
      message: {
        id: randomUUID(),
        networkId: network.id,
        target: 'helper',
        nick: 'helper',
        body: 'waves',
        kind: 'action',
        self: false,
        ts: Date.now(),
      },
    }
  );

  assert.equal(storage.conversations.getBufferByTarget(network.id, 'helper')?.kind, 'query');
  assert.equal(storage.conversations.listMessages(network.id, 'helper', 5)[0]?.kind, 'action');
  assert.ok(sent.some((message) => message.type === 'message.append'));
});

test('service messages on the server buffer close stale service queries', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const network = storage.networks.upsert(createNetworkInput());
  const query = storage.conversations.upsertQuery(network.id, 'NickServ');
  const sent: Array<{ type: string; [key: string]: unknown }> = [];

  handleRuntimeEvent(
    { store: storage, publish(message) { sent.push(message); } },
    {
      type: 'message',
      message: {
        id: randomUUID(),
        networkId: network.id,
        target: 'server',
        nick: 'NickServ',
        body: 'Use IDENTIFY first',
        kind: 'line',
        self: false,
        ts: Date.now(),
      },
    }
  );

  assert.equal(storage.conversations.getBufferByTarget(network.id, 'NickServ'), null);
  assert.ok(sent.some((message) => message.type === 'message.append'));
  assert.deepEqual(sent.find((message) => message.type === 'buffer.remove'), {
    type: 'buffer.remove',
    networkId: network.id,
    bufferId: query.id,
  });
});

test('status events keep their originating buffer target and message kind', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const network = storage.networks.upsert(createNetworkInput());
  const channel = storage.conversations.upsertChannel({
    networkId: network.id,
    name: '#help',
    topic: '',
    users: [makeUser('tester')],
  });
  const sent: Array<{ type: string; [key: string]: unknown }> = [];

  handleRuntimeEvent(
    { store: storage, publish(message) { sent.push(message); } },
    {
      type: 'status',
      networkId: network.id,
      target: '#help',
      kind: 'error',
      message: '* You need to be identified to message that user',
    }
  );

  const appended = storage.conversations.listMessages(network.id, '#help', 10);
  assert.equal(appended.length, 1);
  assert.equal(appended[0]?.target, '#help');
  assert.equal(appended[0]?.kind, 'error');
  assert.equal(storage.conversations.getBuffer(channel.id)?.unread, 1);
  assert.ok(sent.some((message) => message.type === 'message.append'));
  assert.deepEqual(sent.find((message) => message.type === 'buffer.upsert'), {
    type: 'buffer.upsert',
    buffer: storage.conversations.getBuffer(channel.id),
  });
});

test('late status events fall back to the server buffer after a channel closes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const network = storage.networks.upsert(createNetworkInput());
  const channel = storage.conversations.upsertChannel({
    networkId: network.id,
    name: '#help',
    topic: '',
    users: [makeUser('tester')],
  });

  storage.conversations.deleteChannelByName(network.id, channel.name);

  handleRuntimeEvent(
    { store: storage, publish() {} },
    {
      type: 'status',
      networkId: network.id,
      target: '#help',
      kind: 'error',
      message: 'No such channel',
    }
  );

  assert.equal(storage.conversations.getBufferByTarget(network.id, '#help'), null);
  assert.equal(storage.conversations.listMessages(network.id, 'server', 5).at(-1)?.body, 'No such channel');
});

test('late status events fall back to the server buffer after a query closes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const network = storage.networks.upsert(createNetworkInput());
  const query = storage.conversations.upsertQuery(network.id, 'helper');

  storage.conversations.removeBuffer(query.id);

  handleRuntimeEvent(
    { store: storage, publish() {} },
    {
      type: 'status',
      networkId: network.id,
      target: 'helper',
      kind: 'error',
      message: 'No such nick',
      requireBoundTarget: true,
    }
  );

  assert.equal(storage.conversations.getBufferByTarget(network.id, 'helper'), null);
  assert.equal(storage.conversations.listMessages(network.id, 'server', 5).at(-1)?.body, 'No such nick');
});
