import assert from 'node:assert/strict';
import test from 'node:test';
import { requestJson } from './helpers/http-request-helpers.js';
import { createHttpRuntimeContext } from './helpers/http-runtime-test-helpers.js';
import { createNetworkInput } from './helpers/http-server-helpers.js';

test('assistant status route reports an unavailable provider without an API key', async () => {
  await withOpenAiApiKey('', async () => {
    const context = await createHttpRuntimeContext();
    try {
      const response = await requestJson(context.port, 'GET', '/api/assistant/status');
      assert.equal(response.status, 200);
      assert.equal(response.json.connected, false);
      assert.equal(response.json.provider, 'unavailable');
    } finally {
      await context.close();
    }
  });
});

test('assistant ask route returns provider errors without losing conversation context', async () => {
  await withOpenAiApiKey('', async () => {
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
      assert.equal(response.json.message, 'OpenAI provider is not connected');
    } finally {
      await context.close();
    }
  });
});

const withOpenAiApiKey = async (value: string, run: () => Promise<void>) => {
  const previous = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = value;
  try {
    await run();
  } finally {
    if (previous === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = previous;
    }
  }
};
