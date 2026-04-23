import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createHttpHandler } from '../server/http-router.js';
import { createRuntime } from '../server/runtime.js';
import { Storage } from '../server/storage.js';
import type { NetworkProfile } from '../shared/protocol.js';
import { listen, requestJson } from './helpers/http-request-helpers.js';
import { createNetworkInput } from './helpers/http-server-helpers.js';

test('close marks hidden connection instances closed without deleting them', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-http-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const template = storage.networks.upsert(createNetworkInput({ name: 'TemplateNet' }));
  const instance = storage.networks.upsert(createNetworkInput({
    templateId: template.id,
    managerHidden: true,
    name: 'TemplateNet instance',
  }));
  storage.conversations.appendMessage({
    id: 'message-1',
    networkId: instance.id,
    target: 'server',
    nick: null,
    body: 'stored history',
    kind: 'system',
    self: true,
    ts: 1,
  });
  const server = createServer(createHttpHandler(createRuntime(storage.runtimeStore).http));
  const port = await listen(server);

  try {
    const response = await requestJson(port, 'POST', `/api/networks/${instance.id}/close`, {});

    assert.equal(response.status, 200);
    assert.equal(response.json.ok, true);
    assert.equal((response.json.network as NetworkProfile).connectionClosed, true);
    assert.equal(storage.networks.get(instance.id)?.connectionClosed, true);
    assert.deepEqual(
      storage.conversations.listMessages(instance.id, 'server', 10).map((message) => message.id),
      ['message-1']
    );
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('delete rejects hidden connection instances', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-http-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const template = storage.networks.upsert(createNetworkInput({ name: 'TemplateNet' }));
  const instance = storage.networks.upsert(createNetworkInput({
    templateId: template.id,
    managerHidden: true,
    name: 'TemplateNet clone',
  }));
  const server = createServer(createHttpHandler(createRuntime(storage.runtimeStore).http));
  const port = await listen(server);

  try {
    const response = await requestJson(port, 'DELETE', `/api/networks/${instance.id}`);

    assert.equal(response.status, 400);
    assert.equal(response.json.message, 'Only saved networks can be removed');
    assert.equal(storage.networks.get(instance.id)?.id, instance.id);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});
