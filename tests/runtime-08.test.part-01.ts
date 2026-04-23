import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { handleRuntimeEvent } from '../server/runtime-events.js';
import { Storage } from '../server/storage.js';
import { createNetworkInput } from './helpers/runtime-test-common.js';

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

test('incoming private messages from muted nicks stay in history without opening a query buffer', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const network = storage.networks.upsert(createNetworkInput());
  storage.mutedNicks.upsert({ networkId: network.id, nick: 'helper' });
  const sent: Array<{ type: string; [key: string]: unknown }> = [];

  handleRuntimeEvent(
    { store: storage, publish(message) { sent.push(message); } },
    {
      type: 'message',
      message: {
        id: randomUUID(),
        networkId: network.id,
        target: 'helper',
        nick: 'HELPER',
        body: 'hello there',
        kind: 'line',
        self: false,
        ts: Date.now(),
      },
    }
  );

  assert.equal(storage.conversations.getBufferByTarget(network.id, 'helper'), null);
  assert.equal(storage.conversations.listMessages(network.id, 'helper', 10)[0]?.body, 'hello there');
  assert.equal(sent.some((message) => message.type === 'message.append'), true);
  assert.equal(sent.some((message) => message.type === 'buffer.upsert'), false);
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

test('direct user notices append to an open private message buffer', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const network = storage.networks.upsert(createNetworkInput());
  const query = storage.conversations.upsertQuery(network.id, 'helper');
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
        body: 'heads up',
        kind: 'notice',
        self: false,
        ts: Date.now(),
      },
    }
  );

  assert.equal(storage.conversations.listMessages(network.id, 'helper', 10)[0]?.body, 'heads up');
  assert.equal(storage.conversations.listMessages(network.id, 'server', 10).length, 0);
  assert.deepEqual(sent.find((message) => message.type === 'buffer.upsert'), {
    type: 'buffer.upsert',
    buffer: storage.conversations.getBuffer(query.id),
  });
});

test('direct user notices fall back to the server buffer when no private message is open', () => {
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
        body: 'heads up',
        kind: 'notice',
        self: false,
        ts: Date.now(),
      },
    }
  );

  assert.equal(storage.conversations.getBufferByTarget(network.id, 'helper'), null);
  assert.equal(storage.conversations.listMessages(network.id, 'helper', 10).length, 0);
  assert.equal(storage.conversations.listMessages(network.id, 'server', 10)[0]?.body, 'heads up');
  assert.deepEqual(sent.find((message) => message.type === 'buffer.upsert'), {
    type: 'buffer.upsert',
    buffer: storage.conversations.getServerBuffer(network.id),
  });
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
