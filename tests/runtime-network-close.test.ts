import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createRuntime } from '../server/runtime.js';
import { Storage } from '../server/storage.js';
import { createNetworkInput, waitFor } from './helpers/runtime-test-common.js';
import { createHandshakeServer } from './helpers/runtime-test-handshake-servers.js';

test('closeConnection closes a workspace network without deleting its logs', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = createRuntime(storage);
  const handshake = await createHandshakeServer([]);
  const network = storage.networks.upsert(createNetworkInput({
    workspaceOpen: true,
    name: 'TemplateNet',
    host: '127.0.0.1',
    port: handshake.port,
    nick: 'closer',
    altNicks: ['closer_', 'closer__'],
    realName: 'closer',
  }));
  storage.conversations.upsertBuffer({ networkId: network.id, kind: 'channel', target: '#help' });
  storage.conversations.appendMessage({
    id: 'message-1',
    networkId: network.id,
    target: '#help',
    nick: 'alice',
    body: 'stored history',
    kind: 'line',
    self: false,
    ts: 1,
  });
  const { connections } = runtime;

  try {
    runtime.sessions.connect(network.id);
    await waitFor(() => connections.has(network.id));

    const result = runtime.networks.closeConnection(network.id);

    assert.equal(connections.has(network.id), false);
    assert.equal(storage.networks.get(network.id)?.workspaceOpen, false);
    assert.deepEqual(
      storage.conversations.listMessages(network.id, '#help', 10).map((message) => message.id),
      ['message-1']
    );
    assert.equal(result.messages.at(-1)?.type, 'network.upsert');
    assert.deepEqual(
      (result.messages.at(-1) as { network?: unknown } | undefined)?.network,
      storage.networks.get(network.id)
    );
  } finally {
    handshake.closeConnections();
    await new Promise<void>((resolve, reject) => handshake.server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('deleteNetwork removes a saved network', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = createRuntime(storage);
  const network = storage.networks.upsert(createNetworkInput({ name: 'TemplateNet' }));

  const result = runtime.networks.deleteNetwork(network.id);

  assert.deepEqual(result.deletedNetworkIds, [network.id]);
  assert.equal(storage.networks.get(network.id), null);
});
