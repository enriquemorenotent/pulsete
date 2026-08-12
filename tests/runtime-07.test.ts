import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { handleRuntimeEvent } from '../server/runtime-events.js';
import { createRuntime } from '../server/runtime.js';
import { Storage } from '../server/storage.js';
import { createNetworkInput, makeUser, waitFor } from './helpers/runtime-test-common.js';
import { createHandshakeServer } from './helpers/runtime-test-handshake-servers.js';

test('deleteNetwork removes runtime connections', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = createRuntime(storage);
  const received: string[] = [];
  const handshake = await createHandshakeServer(received);
  const network = storage.networks.upsert(createNetworkInput({
    name: 'DeleteNet',
    host: '127.0.0.1',
    port: handshake.port,
    nick: 'deleter',
    altNicks: ['deleter_', 'deleter__'],
    realName: 'deleter',
  }));
  const { connections } = runtime;

  try {
    runtime.sessions.connect(network.id);
    await waitFor(() => connections.has(network.id));

    runtime.networks.deleteNetwork(network.id);

    assert.equal(connections.has(network.id), false);
    assert.equal(storage.networks.get(network.id), null);
  } finally {
    handshake.closeConnections();
    await new Promise<void>((resolve, reject) => handshake.server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('runtime close disconnects active connections without appending shutdown noise', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = createRuntime(storage);
  const handshake = await createHandshakeServer([]);
  const network = storage.networks.upsert(createNetworkInput({
    name: 'CloseNet',
    host: '127.0.0.1',
    port: handshake.port,
    nick: 'close',
    altNicks: ['close_', 'close__'],
    realName: 'close',
  }));
  const { connections } = runtime;

  try {
    runtime.sessions.connect(network.id);
    await waitFor(() => handshake.hasConnections());
    const beforeShutdownMessages = storage.conversations.listMessages(network.id, 'server', 20).map((message) => message.body);

    runtime.gateway.close();

    await waitFor(() => !handshake.hasConnections());
    assert.equal(connections.size, 0);
    assert.deepEqual(
      storage.conversations.listMessages(network.id, 'server', 20).map((message) => message.body),
      beforeShutdownMessages
    );
  } finally {
    handshake.closeConnections();
    await new Promise<void>((resolve, reject) => handshake.server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('deleteNetwork removes open network connections', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = createRuntime(storage);
  const received: string[] = [];
  const handshake = await createHandshakeServer(received);
  const network = storage.networks.upsert(createNetworkInput({
    workspaceOpen: true,
    host: '127.0.0.1',
    port: handshake.port,
    nick: 'template',
    altNicks: ['template_', 'template__'],
    realName: 'template',
  }));
  const { connections } = runtime;
  let uncaught: string | null = null;
  const onUncaught = (error: unknown) => {
    uncaught = error instanceof Error ? error.message : String(error);
  };
  process.once('uncaughtException', onUncaught);

  try {
    runtime.sessions.connect(network.id);
    await waitFor(() => received.includes('NICK template'));

    runtime.networks.deleteNetwork(network.id);
    await new Promise((resolve) => setTimeout(resolve, 100));

    assert.equal(storage.networks.get(network.id), null);
    assert.equal(connections.has(network.id), false);
    assert.equal(uncaught, null);
  } finally {
    process.removeListener('uncaughtException', onUncaught);
    handshake.closeConnections();
    await new Promise<void>((resolve, reject) => handshake.server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('self part events remove the channel and emit buffer.remove', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const network = storage.networks.upsert(createNetworkInput());
  const channel = storage.conversations.upsertChannel({
    networkId: network.id,
    name: '#help',
    topic: 'support',
    unread: 0,
    users: [makeUser('tester'), makeUser('alice')],
  });
  const sent: Array<{ type: string; [key: string]: unknown }> = [];

  handleRuntimeEvent(
    { store: storage, publish(message) { sent.push(message); } },
    {
      type: 'message',
      message: {
        id: randomUUID(),
        networkId: network.id,
        target: '#help',
        nick: 'tester',
        body: 'tester left #help (Leaving)',
        kind: 'part',
        self: true,
        ts: Date.now(),
      },
    }
  );

  assert.equal(storage.conversations.getChannelByName(network.id, '#help'), null);
  assert.ok(sent.some((message) => message.type === 'message.append'));
  assert.deepEqual(
    sent.find((message) => message.type === 'buffer.remove'),
    {
      type: 'buffer.remove',
      networkId: network.id,
      bufferId: channel.id,
    }
  );
});

test('late duplicate self part events do not recreate the channel buffer', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const network = storage.networks.upsert(createNetworkInput());
  storage.conversations.upsertChannel({
    networkId: network.id,
    name: '#help',
    topic: 'support',
    unread: 0,
    users: [makeUser('tester')],
  });

  const event = () => ({
    type: 'message' as const,
    message: {
      id: randomUUID(),
      networkId: network.id,
      target: '#help',
      nick: 'tester',
      body: 'tester left #help (Leaving)',
      kind: 'part' as const,
      self: true,
      ts: Date.now(),
    },
  });

  handleRuntimeEvent({ store: storage, publish() {} }, event());
  handleRuntimeEvent({ store: storage, publish() {} }, event());

  assert.equal(storage.conversations.getBufferByTarget(network.id, '#help'), null);
  assert.equal(storage.conversations.listMessages(network.id, '#help', 10).length, 1);
});

test('late duplicate self kick events do not append orphaned history', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const network = storage.networks.upsert(createNetworkInput());
  storage.conversations.upsertChannel({
    networkId: network.id,
    name: '#help',
    topic: 'support',
    unread: 0,
    users: [makeUser('tester')],
  });

  const event = () => ({
    type: 'message' as const,
    message: {
      id: randomUUID(),
      networkId: network.id,
      target: '#help',
      nick: 'tester',
      body: 'tester was kicked from #help by op (bye)',
      kind: 'part' as const,
      self: true,
      ts: Date.now(),
    },
  });

  handleRuntimeEvent({ store: storage, publish() {} }, event());
  handleRuntimeEvent({ store: storage, publish() {} }, event());

  assert.equal(storage.conversations.getBufferByTarget(network.id, '#help'), null);
  assert.equal(storage.conversations.listMessages(network.id, '#help', 10).length, 1);
});
