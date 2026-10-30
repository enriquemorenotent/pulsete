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
  const keys = ['PATH', 'HOME', 'NVM_DIR', 'NPM_CONFIG_PREFIX'] as const;
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  for (const key of keys) process.env[key] = '';
  try {
    await run();
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
};

test('disconnecting an assistant HTTP request aborts its provider work', async () => {
  const context = await createHttpRuntimeContext();
  const network = context.storage.networks.upsert(createNetworkInput());
  const buffer = context.storage.conversations.upsertBuffer({
    kind: 'channel', networkId: network.id, target: '#cancel',
  });
  let started!: () => void;
  let cancelled!: () => void;
  const start = new Promise<void>((resolve) => { started = resolve; });
  const abort = new Promise<void>((resolve) => { cancelled = resolve; });
  context.runtime.http.assistant.ask = async (_bufferId, _request, signal) => {
    started();
    return new Promise((_resolve, reject) => {
      signal?.addEventListener('abort', () => {
        cancelled();
        reject(new Error('cancelled'));
      }, { once: true });
    });
  };
  const controller = new AbortController();
  try {
    const request = fetch(`http://127.0.0.1:${context.port}/api/buffers/${buffer.id}/assistant`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'answer', prompt: 'Hello' }), signal: controller.signal,
    }).catch(() => undefined);
    await start;
    controller.abort();
    await Promise.race([abort, new Promise<void>((_resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Provider was not cancelled')), 2_000);
      timer.unref();
    })]);
    await request;
  } finally { await context.close(); }
});

test('assistant route streams progress and final result, and encodes late errors', async () => {
  const context = await createHttpRuntimeContext();
  try {
    context.runtime.http.assistant.ask = async (_buffer, _request, signal, options) => {
      assert.ok(signal); assert.ok(options?.sessionId);
      options.onProgress?.('reading');
      return { answer: 'Test answer', mode: 'answer', context: { buffer: { id: 'test', kind: 'channel', networkId: 'n', target: '#test' }, messages: [] },
        status: { connected: false, detail: '', provider: 'unavailable', model: null, availableModels: [], modelsError: null, reasoningEffort: null, selectionNotice: null } };
    };
    const ask = () => fetch(`http://127.0.0.1:${context.port}/api/buffers/test/assistant`, { method: 'POST',
      headers: { Accept: 'application/x-ndjson', 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: 'Hello' }) });
    const response = await ask();
    assert.match(response.headers.get('content-type')!, /ndjson/);
    const events = (await response.text()).trim().split('\n').map((line) => JSON.parse(line));
    assert.deepEqual(events.map((event) => event.type), ['progress', 'result']);
    assert.equal(events[0].stage, 'reading');
    context.runtime.http.assistant.ask = async () => { throw new Error('private failure'); };
    const failed = (await (await ask()).text()).trim();
    assert.deepEqual(JSON.parse(failed), { type: 'error', message: 'Internal server error' });
  } finally { await context.close(); }
});
