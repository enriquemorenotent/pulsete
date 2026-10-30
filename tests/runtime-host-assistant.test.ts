import assert from 'node:assert/strict';
import test from 'node:test';
import { RuntimeHost } from '../server/runtime-host.js';
import type { Runtime } from '../server/runtime.js';
import { makeStorageFile } from './helpers/storage-test-helpers.js';
import type { AiAssistantRequest } from '../shared/protocol-ai.js';

test('desktop runtime host forwards assistant cancellation, progress, session and clearing', async () => {
  const host = new RuntimeHost(makeStorageFile());
  try {
    const core = (host as unknown as { runtime: Runtime }).runtime;
    const signal = new AbortController().signal;
    const stages: string[] = [];
    const options = { sessionId: 'session-a', onProgress: (stage: string) => stages.push(stage) };
    const request: AiAssistantRequest = { mode: 'answer', prompt: 'Question', assistantTurns: [], selection: { model: null, reasoningEffort: null } };
    core.http.assistant.ask = async (bufferId, input, forwardedSignal, forwardedOptions) => {
      assert.equal(bufferId, 'buffer-a'); assert.equal(input, request);
      assert.equal(forwardedSignal, signal); assert.equal(forwardedOptions, options);
      forwardedOptions?.onProgress?.('reading');
      throw new Error('Reached inner runtime');
    };
    await assert.rejects(host.http.assistant.ask('buffer-a', request, signal, options), /Reached inner runtime/);
    assert.deepEqual(stages, ['reading']);
    let cleared = false;
    core.http.assistant.clear = (bufferId, token, sessionId) => {
      assert.deepEqual([bufferId, token, sessionId], ['buffer-a', 'token-a', 'session-a']); cleared = true;
    };
    host.http.assistant.clear?.('buffer-a', 'token-a', 'session-a');
    assert.equal(cleared, true);
  } finally { host.close(); }
});
