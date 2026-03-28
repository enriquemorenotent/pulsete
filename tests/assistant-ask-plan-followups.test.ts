import assert from 'node:assert/strict';
import test from 'node:test';
import { planAssistantAskTurn } from '../server/assistant-ask-planner.js';
import {
  buildPreviousLexicalRetrieval,
  missD,
  missProxima,
  queryBuffers,
} from './helpers/assistant-ask-fixtures.js';

test('hint follow-ups refine the remembered subject and reuse earlier evidence', () => {
  const plan = planAssistantAskTurn({
    prompt: `I'll give you a hint. It involved a "hotel".`,
    queryBuffers,
    rememberedSubject: missD,
    selectedBuffer: missProxima,
    previousRetrievals: [buildPreviousLexicalRetrieval()],
  });
  assert.equal(plan.outcome, 'retrieve');
  assert.equal(plan.resolvedSubject, missD);
  assert.equal(plan.reusePreviousRetrievals, true);
  if (plan.outcome !== 'retrieve') assert.fail('Expected a retrieval plan');
  assert.equal(plan.requests[0]?.operation, 'fts_search');
  if (plan.requests[0]?.operation !== 'fts_search') assert.fail('Expected an FTS retrieval request');
  assert.ok(plan.requests[0].searchTerms.includes('hotel'));
});

test('plain-language follow-up hints still trigger refinement retrieval', () => {
  const plan = planAssistantAskTurn({
    prompt: 'It was related to a hotel',
    queryBuffers,
    rememberedSubject: missD,
    selectedBuffer: missProxima,
    previousRetrievals: [buildPreviousLexicalRetrieval()],
  });
  assert.equal(plan.outcome, 'retrieve');
  assert.equal(plan.resolvedSubject, missD);
  assert.equal(plan.reusePreviousRetrievals, true);
  if (plan.outcome !== 'retrieve') assert.fail('Expected a retrieval plan');
  assert.equal(plan.requests[0]?.operation, 'fts_search');
  if (plan.requests[0]?.operation !== 'fts_search') assert.fail('Expected an FTS retrieval request');
  assert.ok(plan.requests[0].searchTerms.includes('hotel'));
});

test('follow-up recall without new terms reuses prior retrieval evidence instead of searching blindly', () => {
  const plan = planAssistantAskTurn({
    prompt: 'What was it?',
    queryBuffers,
    rememberedSubject: missD,
    selectedBuffer: missProxima,
    previousRetrievals: [buildPreviousLexicalRetrieval()],
  });
  assert.equal(plan.outcome, 'retrieve');
  assert.equal(plan.resolvedSubject, missD);
  assert.equal(plan.reusePreviousRetrievals, true);
  if (plan.outcome !== 'retrieve') assert.fail('Expected a retrieval plan');
  assert.equal(plan.requests[0]?.operation, 'fts_search');
});

test('origin questions pivot away from stale prior retrieval topics', () => {
  const plan = planAssistantAskTurn({
    prompt: 'Where is MissD from?',
    queryBuffers,
    rememberedSubject: missD,
    selectedBuffer: missD,
    previousRetrievals: [buildPreviousLexicalRetrieval(['fantasy', 'hotel'])],
  });
  assert.equal(plan.outcome, 'retrieve');
  assert.equal(plan.resolvedSubject, missD);
  assert.equal(plan.reusePreviousRetrievals, false);
  if (plan.outcome !== 'retrieve') assert.fail('Expected a retrieval plan');
  assert.equal(plan.requests[0]?.operation, 'profile_fact_search');
  assert.equal(plan.requests[1]?.operation, 'load_opening_buffer_messages');
  if (plan.requests[0]?.operation !== 'profile_fact_search') assert.fail('Expected a profile fact retrieval request');
  assert.deepEqual(plan.requests[0].intent, 'origin_location');
  assert.ok(plan.requests[0].searchTerms.includes('where'));
  assert.ok(plan.requests[0].searchTerms.includes('from'));
});

test('implicit recollection prompts trigger transcript retrieval on the first turn', () => {
  const plan = planAssistantAskTurn({
    prompt: 'MissD and I have talked about a fantasy, the first time that we would meet in person. Can you remind me what it is?',
    queryBuffers,
    selectedBuffer: missD,
  });
  assert.equal(plan.outcome, 'retrieve');
  assert.equal(plan.resolvedSubject, missD);
  if (plan.outcome !== 'retrieve') assert.fail('Expected a retrieval plan');
  assert.equal(plan.requests[0]?.operation, 'fts_search');
  if (plan.requests[0]?.operation !== 'fts_search') assert.fail('Expected an FTS retrieval request');
  assert.ok(plan.requests[0].searchTerms.includes('fantasy'));
  assert.ok(plan.requests[0].searchTerms.some((term) => term.includes('person') || term.includes('meet') || term.includes('time')));
});

test('colloquial recollection prompts still trigger retrieval', () => {
  const plan = planAssistantAskTurn({
    prompt: 'MissD and I talked about a fantasy, of when we meet in real. Tell me which one it is',
    queryBuffers,
    selectedBuffer: missD,
  });
  assert.equal(plan.outcome, 'retrieve');
  assert.equal(plan.resolvedSubject, missD);
  if (plan.outcome !== 'retrieve') assert.fail('Expected a retrieval plan');
  assert.equal(plan.requests[0]?.operation, 'fts_search');
  if (plan.requests[0]?.operation !== 'fts_search') assert.fail('Expected an FTS retrieval request');
  assert.ok(plan.requests[0].searchTerms.includes('fantasy'));
});
