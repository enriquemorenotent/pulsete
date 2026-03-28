import assert from 'node:assert/strict';
import test from 'node:test';
import { planAssistantAskTurn } from '../server/assistant-ask-planner.js';
import { missD, missProxima, queryBuffers } from './helpers/assistant-ask-fixtures.js';

test('chatty prompts stay on the answer path even when a buffer is selected', () => {
  const plan = planAssistantAskTurn({ prompt: 'Hello', queryBuffers, selectedBuffer: missD });
  assert.equal(plan.outcome, 'answer');
  assert.equal(plan.resolvedSubject, null);
});

test('general character chat uses the named subject without triggering transcript retrieval', () => {
  const plan = planAssistantAskTurn({ prompt: 'What do you think about MissD?', queryBuffers, selectedBuffer: missProxima });
  assert.equal(plan.outcome, 'answer');
  assert.equal(plan.resolvedSubject, missD);
});

test('named subject mismatches the selected buffer and triggers confirmation', () => {
  const plan = planAssistantAskTurn({ prompt: 'When did MissD say hello?', queryBuffers, selectedBuffer: missProxima });
  assert.equal(plan.outcome, 'clarify');
  assert.match(plan.instruction, /Search MissD instead/);
  assert.deepEqual(plan.routing, {
    pendingClarification: {
      kind: 'confirmResolvedSubject',
      originalPrompt: 'When did MissD say hello?',
      candidate: missD,
      selectedBuffer: missProxima,
    },
    retrievals: [],
  });
});

test('affirming a subject confirmation resolves retrieval against the named chat', () => {
  const plan = planAssistantAskTurn({
    prompt: 'Yes',
    queryBuffers,
    selectedBuffer: missProxima,
    pendingClarification: {
      kind: 'confirmResolvedSubject',
      originalPrompt: 'When did MissD say hello?',
      candidate: missD,
      selectedBuffer: missProxima,
    },
  });
  assert.equal(plan.outcome, 'retrieve');
  assert.equal(plan.resolvedSubject, missD);
  if (plan.outcome !== 'retrieve') assert.fail('Expected a retrieval plan');
  assert.equal(plan.requests[0]?.operation, 'fts_search');
  if (plan.requests[0]?.operation !== 'fts_search') assert.fail('Expected an FTS retrieval request');
  assert.ok(plan.requests[0].searchTerms.includes('hello'));
});

test('named unknown subjects clarify instead of falling back to the selected buffer', () => {
  const plan = planAssistantAskTurn({ prompt: 'When did Diana say hello?', queryBuffers, selectedBuffer: missProxima });
  assert.equal(plan.outcome, 'clarify');
  assert.match(plan.instruction, /no known private chat named Diana/i);
});

test('opening-history prompts can use the remembered subject directly', () => {
  const plan = planAssistantAskTurn({
    prompt: 'Tell me about the way we started talking in the beginning',
    queryBuffers,
    rememberedSubject: missD,
    selectedBuffer: missProxima,
  });
  assert.equal(plan.outcome, 'retrieve');
  assert.equal(plan.resolvedSubject, missD);
  if (plan.outcome !== 'retrieve') assert.fail('Expected a retrieval plan');
  assert.equal(plan.requests[0]?.operation, 'load_opening_buffer_messages');
});
