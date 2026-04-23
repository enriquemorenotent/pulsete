import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createRuntime } from '../server/runtime.js';
import { Storage } from '../server/storage.js';
import { createNetworkInput, waitFor } from './helpers/runtime-test-common.js';
import { createHandshakeServer } from './helpers/runtime-test-handshake-servers.js';

test('connectNetwork opens a saved network as a reusable connection instance', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = createRuntime(storage.runtimeStore);
  const handshake = await createHandshakeServer([]);
  const template = storage.networks.upsert(createNetworkInput({
    host: '127.0.0.1',
    port: handshake.port,
  }));

  try {
    const first = runtime.networks.connectNetwork(template.id);
    assert.equal(first.network.managerHidden, true);
    assert.equal(first.network.templateId, template.id);
    assert.equal(first.serverBuffer?.networkId, first.network.id);
    assert.equal(first.messages.some((message) => message.type === 'buffer.upsert'), true);
    assert.equal(first.messages.some((message) => message.type === 'network.upsert'), true);
    await waitFor(() => handshake.hasConnections());

    const second = runtime.networks.connectNetwork(template.id);
    assert.equal(second.network.id, first.network.id);
    assert.equal(storage.networks.list().filter((network) => network.templateId === template.id).length, 1);

    const closed = runtime.networks.closeConnection(first.network.id).network;
    assert.equal(closed.connectionClosed, true);
    const reopened = runtime.networks.connectNetwork(template.id);
    assert.equal(reopened.network.id, first.network.id);
    assert.equal(reopened.network.connectionClosed, false);
  } finally {
    for (const connectionId of Array.from(runtime.connections.keys())) {
      runtime.sessions.disconnect(connectionId);
    }
    handshake.closeConnections();
    await new Promise<void>((resolve, reject) => handshake.server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('connectNetwork accepts a concrete connection instance id', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = createRuntime(storage.runtimeStore);
  const handshake = await createHandshakeServer([]);
  const template = storage.networks.upsert(createNetworkInput({ name: 'TemplateNet' }));
  const instance = storage.networks.upsert(createNetworkInput({
    templateId: template.id,
    managerHidden: true,
    host: '127.0.0.1',
    port: handshake.port,
  }));

  try {
    const result = runtime.networks.connectNetwork(instance.id);
    assert.equal(result.network.id, instance.id);
    assert.equal(result.serverBuffer?.networkId, instance.id);
    await waitFor(() => handshake.hasConnections());
  } finally {
    runtime.sessions.disconnect(instance.id);
    handshake.closeConnections();
    await new Promise<void>((resolve, reject) => handshake.server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('connectNetwork returns a visible instance even when the IRC socket fails later', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = createRuntime(storage.runtimeStore);
  const closedServer = await createHandshakeServer([]);
  const port = closedServer.port;
  await new Promise<void>((resolve, reject) => closedServer.server.close((error) => (error ? reject(error) : resolve())));
  const template = storage.networks.upsert(createNetworkInput({
    host: '127.0.0.1',
    port,
  }));
  let connectionId: string | null = null;

  try {
    const result = runtime.networks.connectNetwork(template.id);
    connectionId = result.network.id;
    assert.equal(result.network.managerHidden, true);
    assert.equal(result.network.templateId, template.id);
    assert.equal(result.serverBuffer?.networkId, result.network.id);
    assert.equal(storage.networks.get(result.network.id)?.id, result.network.id);
  } finally {
    if (connectionId) {
      runtime.sessions.disconnect(connectionId);
    }
  }
});
