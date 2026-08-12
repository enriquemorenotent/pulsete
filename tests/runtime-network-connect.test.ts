import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createRuntime } from '../server/runtime.js';
import { Storage } from '../server/storage.js';
import { createNetworkInput, waitFor } from './helpers/runtime-test-common.js';
import { createHandshakeServer } from './helpers/runtime-test-handshake-servers.js';

test('connectNetwork opens a saved network in the workspace', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = createRuntime(storage);
  const handshake = await createHandshakeServer([]);
  const network = storage.networks.upsert(createNetworkInput({
    host: '127.0.0.1',
    port: handshake.port,
  }));

  try {
    const first = runtime.networks.connectNetwork(network.id);
    assert.equal(first.network.workspaceOpen, true);
    assert.equal(first.network.id, network.id);
    assert.equal(first.serverBuffer?.networkId, first.network.id);
    assert.equal(first.messages.some((message) => message.type === 'buffer.upsert'), true);
    assert.equal(first.messages.some((message) => message.type === 'network.upsert'), true);
    await waitFor(() => handshake.hasConnections());

    const second = runtime.networks.connectNetwork(network.id);
    assert.equal(second.network.id, first.network.id);
    assert.equal(storage.networks.list().filter((stored) => stored.id === network.id).length, 1);

    const closed = runtime.networks.closeConnection(first.network.id).network;
    assert.equal(closed.workspaceOpen, false);
    const reopened = runtime.networks.connectNetwork(network.id);
    assert.equal(reopened.network.id, first.network.id);
    assert.equal(reopened.network.workspaceOpen, true);
  } finally {
    for (const connectionId of Array.from(runtime.connections.keys())) {
      runtime.sessions.disconnect(connectionId);
    }
    handshake.closeConnections();
    await new Promise<void>((resolve, reject) => handshake.server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('connectNetwork accepts a concrete network id', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = createRuntime(storage);
  const handshake = await createHandshakeServer([]);
  const network = storage.networks.upsert(createNetworkInput({
    workspaceOpen: true,
    host: '127.0.0.1',
    port: handshake.port,
  }));

  try {
    const result = runtime.networks.connectNetwork(network.id);
    assert.equal(result.network.id, network.id);
    assert.equal(result.serverBuffer?.networkId, network.id);
    await waitFor(() => handshake.hasConnections());
  } finally {
    runtime.sessions.disconnect(network.id);
    handshake.closeConnections();
    await new Promise<void>((resolve, reject) => handshake.server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('connectNetwork keeps a workspace network visible even when the IRC socket fails later', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = createRuntime(storage);
  const closedServer = await createHandshakeServer([]);
  const port = closedServer.port;
  await new Promise<void>((resolve, reject) => closedServer.server.close((error) => (error ? reject(error) : resolve())));
  const network = storage.networks.upsert(createNetworkInput({
    host: '127.0.0.1',
    port,
  }));
  let connectionId: string | null = null;

  try {
    const result = runtime.networks.connectNetwork(network.id);
    connectionId = result.network.id;
    assert.equal(result.network.workspaceOpen, true);
    assert.equal(result.network.id, network.id);
    assert.equal(result.serverBuffer?.networkId, result.network.id);
    assert.equal(storage.networks.get(result.network.id)?.id, result.network.id);
  } finally {
    if (connectionId) {
      runtime.sessions.disconnect(connectionId);
    }
  }
});
