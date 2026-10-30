import assert from 'node:assert/strict';
import test from 'node:test';
import { readAssistantStream } from '../web/src/ai-assistant-stream.js';
import { createAiAssistantStore } from '../web/src/ai-assistant-store.js';
const response = (chunks: string[]) => new Response(new ReadableStream({ start(controller) {
  for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk)); controller.close();
} }));
test('stream parser handles fragmented events, progress and a final result', async () => {
  const stages: string[] = [];
  const result = await readAssistantStream(response(['{"type":"pro', 'gress","stage":"reading"}\n',
    '{"type":"result","response":{"answer":"Café"}}\n']), (stage) => stages.push(stage));
  assert.deepEqual(stages, ['reading']); assert.equal(result.answer, 'Café');
});
test('stream parser rejects errors, premature closure and cancelled results', async () => {
  await assert.rejects(readAssistantStream(response(['{"type":"error","message":"No sources"}\n'])), /No sources/);
  await assert.rejects(readAssistantStream(response(['{"type":"progress","stage":"writing"}\n'])), /ended before/);
  await assert.rejects(readAssistantStream(response(['{"type":"result","response":{}}\n']), undefined, AbortSignal.abort()), /abort/i);
});
test('stale progress and answers cannot revive a cancelled or cleared request', () => {
  const store = createAiAssistantStore();
  const id = store.startRequest('a', { label: 'Question', pendingLabel: 'Thinking' })!;
  store.updateProgress('a', id, 'Searching history'); assert.equal(store.getThread('a').pendingLabel, 'Searching history');
  store.failRequest('a', id, 'Request cancelled');
  store.updateProgress('a', id, 'Writing'); store.resolveRequest('a', id, { mode: 'answer', text: 'Late answer' });
  assert.equal(store.getThread('a').entries.length, 1); assert.equal(store.getThread('a').pending, false);
  store.clearThread('a'); store.updateProgress('a', id, 'Reading'); assert.equal(store.getThread('a').entries.length, 0);
});
