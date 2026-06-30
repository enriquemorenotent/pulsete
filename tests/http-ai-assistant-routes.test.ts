import assert from 'node:assert/strict';
import test from 'node:test';
import { requestJson } from './helpers/http-request-helpers.js';
import { createHttpRuntimeContext } from './helpers/http-runtime-test-helpers.js';
import { createNetworkInput } from './helpers/http-server-helpers.js';

test('assistant status route reports unavailable when Codex CLI is missing', async () => {
  await withMissingCodexPath(async () => {
    const context = await createHttpRuntimeContext();
    try {
      const response = await requestJson(context.port, 'GET', '/api/assistant/status');
      assert.equal(response.status, 200);
      assert.equal(response.json.connected, false);
      assert.equal(response.json.provider, 'unavailable');
      assert.match(String(response.json.detail), /Install Codex CLI/);
    } finally {
      await context.close();
    }
  });
});

test('assistant ask route returns Codex provider errors without losing conversation context', async () => {
  await withMissingCodexPath(async () => {
    const context = await createHttpRuntimeContext();
    const network = context.storage.networks.upsert(createNetworkInput());
    const buffer = context.storage.conversations.upsertBuffer({
      kind: 'channel',
      networkId: network.id,
      target: '#help',
    });
    context.storage.conversations.appendMessage({
      body: 'The password is under the bridge',
      id: 'message-1',
      kind: 'line',
      networkId: network.id,
      nick: 'alice',
      self: false,
      target: buffer.target,
      ts: Date.now(),
    });
    try {
      const response = await requestJson(
        context.port,
        'POST',
        `/api/buffers/${buffer.id}/assistant`,
        { mode: 'answer', prompt: 'Where is the password?' },
      );
      assert.equal(response.status, 503);
      assert.match(String(response.json.message), /Install Codex CLI/);
    } finally {
      await context.close();
    }
  });
});

const withMissingCodexPath = async (run: () => Promise<void>) => {
  const previous = process.env.PATH;
  process.env.PATH = '';
  try {
    await run();
  } finally {
    if (previous === undefined) {
      delete process.env.PATH;
    } else {
      process.env.PATH = previous;
    }
  }
};
