import assert from 'node:assert/strict';
import test from 'node:test';
import type { RuntimeDebugMemorySnapshot } from '../shared/protocol-debug.js';
import { createHttpRuntimeContext } from './helpers/http-runtime-test-helpers.js';
import { createNetworkInput } from './helpers/http-server-helpers.js';

test('debug memory route reports process and runtime counts', async () => {
  const context = await createHttpRuntimeContext();
  const network = context.storage.networks.upsert(createNetworkInput());
  context.storage.conversations.upsertQuery(network.id, 'helper');

  try {
    const response = await fetch(`http://127.0.0.1:${context.port}/api/debug/memory`);
    const body = await response.json() as RuntimeDebugMemorySnapshot;

    assert.equal(response.status, 200);
    assert.equal(body.runtime.networks, 1);
    assert.equal(body.runtime.buffers, 1);
    assert.equal(body.runtime.queryBuffers, 1);
    assert.equal(body.runtime.websocketClients, 0);
    assert.equal(typeof body.process.heapUsed, 'number');
    assert.equal(typeof body.process.rss, 'number');
    assert.match(body.capturedAt, /^\d{4}-\d{2}-\d{2}T/);
  } finally {
    await context.close();
  }
});
