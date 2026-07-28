import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createAiAssistantStore,
  emptyAiAssistantThread,
} from '../web/src/ai-assistant-store.js';

test('assistant store preserves an independent session thread for each buffer', () => {
  const store = createAiAssistantStore();
  const firstRequest = store.startRequest('buffer-a', {
    label: 'Summarize this',
    pendingLabel: 'Summarizing',
  });
  assert.notEqual(firstRequest, null);
  store.resolveRequest('buffer-a', firstRequest!, {
    mode: 'answer',
    text: 'First summary',
  });

  store.setInput('buffer-b', 'A draft for another tab');

  assert.deepEqual(
    store.getThread('buffer-a').entries.map((entry) => [entry.role, entry.text]),
    [
      ['user', 'Summarize this'],
      ['assistant', 'First summary'],
    ],
  );
  assert.equal(store.getThread('buffer-b').input, 'A draft for another tab');
  assert.equal(store.getThread('buffer-a').input, '');
});

test('starting a new assistant chat clears the current buffer and ignores its old response', () => {
  const store = createAiAssistantStore();
  const oldRequest = store.startRequest('buffer-a', {
    label: 'Old question',
    pendingLabel: 'Thinking',
  });
  assert.notEqual(oldRequest, null);

  store.clearThread('buffer-a');
  store.resolveRequest('buffer-a', oldRequest!, {
    mode: 'answer',
    text: 'Stale answer',
  });

  assert.equal(store.getThread('buffer-a'), emptyAiAssistantThread);

  const newRequest = store.startRequest('buffer-a', {
    label: 'New question',
    pendingLabel: 'Thinking',
  });
  assert.notEqual(newRequest, null);
  assert.notEqual(newRequest, oldRequest);
  store.resolveRequest('buffer-a', newRequest!, {
    mode: 'answer',
    text: 'Fresh answer',
  });

  assert.deepEqual(
    store.getThread('buffer-a').entries.map((entry) => entry.text),
    ['New question', 'Fresh answer'],
  );
});

test('assistant store prunes threads only after their buffers close', () => {
  const store = createAiAssistantStore();
  store.setInput('buffer-a', 'Keep me');
  store.setInput('buffer-b', 'Remove me');

  store.pruneThreads(['buffer-a']);

  assert.equal(store.getThread('buffer-a').input, 'Keep me');
  assert.equal(store.getThread('buffer-b'), emptyAiAssistantThread);
});

test('assistant threads do not carry into a new application session', () => {
  const currentSession = createAiAssistantStore();
  currentSession.setInput('buffer-a', 'Session-only draft');

  const reloadedSession = createAiAssistantStore();

  assert.equal(reloadedSession.getThread('buffer-a'), emptyAiAssistantThread);
});
