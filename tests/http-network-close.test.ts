import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createHttpHandler } from '../server/http-router.js';
import { createRuntime } from '../server/runtime.js';
import { Storage } from '../server/storage.js';
import type { NetworkProfile } from '../shared/protocol-chat.js';
import { listen, requestJson } from './helpers/http-request-helpers.js';
import { createNetworkInput } from './helpers/http-server-helpers.js';

test('close marks workspace networks closed without deleting stored logs', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-http-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const network = storage.networks.upsert(createNetworkInput({
    workspaceOpen: true,
    name: 'TemplateNet',
  }));
  storage.conversations.appendMessage({
    id: 'message-1',
    networkId: network.id,
    target: 'server',
    nick: null,
    body: 'stored history',
    kind: 'system',
    self: true,
    ts: 1,
  });
  const server = createServer(createHttpHandler(createRuntime(storage).http));
  const port = await listen(server);

  try {
    const response = await requestJson(port, 'POST', `/api/networks/${network.id}/close`, {});

    assert.equal(response.status, 200);
    assert.equal(response.json.ok, true);
    assert.equal((response.json.network as NetworkProfile).workspaceOpen, false);
    assert.equal(storage.networks.get(network.id)?.workspaceOpen, false);
    assert.deepEqual(
      storage.conversations.listMessages(network.id, 'server', 10).map((message) => message.id),
      ['message-1']
    );
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('delete removes saved networks', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-http-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const network = storage.networks.upsert(createNetworkInput({ name: 'TemplateNet' }));
  const server = createServer(createHttpHandler(createRuntime(storage).http));
  const port = await listen(server);

  try {
    const response = await requestJson(port, 'DELETE', `/api/networks/${network.id}`);

    assert.equal(response.status, 200);
    assert.equal(response.json.ok, true);
    assert.equal(storage.networks.get(network.id), null);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});
