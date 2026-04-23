import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createRuntime } from '../server/runtime.js';
import { Storage } from '../server/storage.js';
import { createNetworkInput, waitFor } from './helpers/runtime-test-common.js';
import { createHandshakeServer } from './helpers/runtime-test-handshake-servers.js';

test('closeConnection hides a connection instance without deleting its logs', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = createRuntime(storage.runtimeStore);
  const handshake = await createHandshakeServer([]);
  const template = storage.networks.upsert(createNetworkInput({
    name: 'TemplateNet',
    nick: 'closer',
    altNicks: ['closer_', 'closer__'],
    username: 'closer',
    realName: 'closer',
  }));
  const instance = storage.networks.upsert(createNetworkInput({
    templateId: template.id,
    managerHidden: true,
    name: 'TemplateNet',
    host: '127.0.0.1',
    port: handshake.port,
    nick: 'closer',
    altNicks: ['closer_', 'closer__'],
    username: 'closer',
    realName: 'closer',
  }));
  storage.conversations.upsertBuffer({ networkId: instance.id, kind: 'channel', target: '#help' });
  storage.conversations.appendMessage({
    id: 'message-1',
    networkId: instance.id,
    target: '#help',
    nick: 'alice',
    body: 'stored history',
    kind: 'line',
    self: false,
    ts: 1,
  });
  const state = runtime as unknown as { connections: Map<string, unknown> };

  try {
    runtime.sessions.connect(instance.id);
    await waitFor(() => state.connections.has(instance.id));

    const result = runtime.networks.closeConnection(instance.id);

    assert.equal(state.connections.has(instance.id), false);
    assert.equal(storage.networks.get(instance.id)?.connectionClosed, true);
    assert.equal(storage.networks.get(template.id)?.id, template.id);
    assert.deepEqual(
      storage.conversations.listMessages(instance.id, '#help', 10).map((message) => message.id),
      ['message-1']
    );
    assert.equal(result.messages.at(-1)?.type, 'network.upsert');
    assert.deepEqual(
      (result.messages.at(-1) as { network?: unknown } | undefined)?.network,
      storage.networks.get(instance.id)
    );
  } finally {
    handshake.closeConnections();
    await new Promise<void>((resolve, reject) => handshake.server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('deleteNetwork rejects hidden connection instances', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = createRuntime(storage.runtimeStore);
  const template = storage.networks.upsert(createNetworkInput({ name: 'TemplateNet' }));
  const instance = storage.networks.upsert(createNetworkInput({
    templateId: template.id,
    managerHidden: true,
    name: 'TemplateNet clone',
  }));

  assert.throws(() => runtime.networks.deleteNetwork(instance.id), /Only saved networks can be removed/);
  assert.equal(storage.networks.get(instance.id)?.id, instance.id);
});
