import assert from 'node:assert/strict';
import test from 'node:test';
import type { AssistantActiveBuffer, ChatMessage } from '../shared/protocol.js';
import {
  planAssistantAskTurn,
  resolveAssistantAskRetrievedContext,
} from '../server/assistant-ask-planner.js';

const missD: AssistantActiveBuffer = {
  bufferId: 'buffer-1',
  networkId: 'network-1',
  target: 'MissD',
  title: 'MissD',
};

const missProxima: AssistantActiveBuffer = {
  bufferId: 'buffer-2',
  networkId: 'network-1',
  target: 'MissProxima',
  title: 'MissProxima',
};

const queryBuffers = [missD, missProxima];

test('chatty prompts stay on the answer path even when a buffer is selected', () => {
  const plan = planAssistantAskTurn({
    prompt: 'Hello',
    queryBuffers,
    selectedBuffer: missD,
  });

  assert.equal(plan.outcome, 'answer');
  assert.equal(plan.resolvedSubject, null);
});

test('general character chat uses the named subject without triggering transcript retrieval', () => {
  const plan = planAssistantAskTurn({
    prompt: 'What do you think about MissD?',
    queryBuffers,
    selectedBuffer: missProxima,
  });

  assert.equal(plan.outcome, 'answer');
  assert.equal(plan.resolvedSubject, missD);
});

test('named subject mismatches the selected buffer and triggers confirmation', () => {
  const plan = planAssistantAskTurn({
    prompt: 'When did MissD say hello?',
    queryBuffers,
    selectedBuffer: missProxima,
  });

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
  if (plan.outcome !== 'retrieve') {
    assert.fail('Expected a retrieval plan');
  }
  assert.equal(plan.requests[0]?.operation, 'fts_search');
  if (plan.requests[0]?.operation !== 'fts_search') {
    assert.fail('Expected an FTS retrieval request');
  }
  assert.ok(plan.requests[0].searchTerms.includes('hello'));
});

test('named unknown subjects clarify instead of falling back to the selected buffer', () => {
  const plan = planAssistantAskTurn({
    prompt: 'When did Diana say hello?',
    queryBuffers,
    selectedBuffer: missProxima,
  });

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
  if (plan.outcome !== 'retrieve') {
    assert.fail('Expected a retrieval plan');
  }
  assert.equal(plan.requests[0]?.operation, 'load_opening_buffer_messages');
});

test('hint follow-ups refine the remembered subject and reuse earlier evidence', () => {
  const plan = planAssistantAskTurn({
    prompt: `I'll give you a hint. It involved a "hotel".`,
    queryBuffers,
    rememberedSubject: missD,
    selectedBuffer: missProxima,
    previousRetrievals: [{
      subject: missD,
      request: {
        operation: 'search_buffer',
        limit: 5,
        searchTerms: ['fantasy', 'meet'],
      },
      stage: 'legacy_search',
      query: 'fantasy, meet',
      confidence: 0.5,
      scoreSummary: 'hits=1',
      context: 'Retrieved transcript context for MissD:\nOperation: search_buffer(limit=5)',
      matchCount: 1,
      matchedMessageIds: ['message-1'],
      windowMessageIds: [['message-1', 'message-2']],
      evidenceMessageIds: ['message-1', 'message-2'],
    }],
  });

  assert.equal(plan.outcome, 'retrieve');
  assert.equal(plan.resolvedSubject, missD);
  assert.equal(plan.reusePreviousRetrievals, true);
  if (plan.outcome !== 'retrieve') {
    assert.fail('Expected a retrieval plan');
  }
  assert.equal(plan.requests[0]?.operation, 'fts_search');
  if (plan.requests[0]?.operation !== 'fts_search') {
    assert.fail('Expected an FTS retrieval request');
  }
  assert.ok(plan.requests[0].searchTerms.includes('hotel'));
});

test('plain-language follow-up hints still trigger refinement retrieval', () => {
  const plan = planAssistantAskTurn({
    prompt: 'It was related to a hotel',
    queryBuffers,
    rememberedSubject: missD,
    selectedBuffer: missProxima,
    previousRetrievals: [{
      subject: missD,
      request: {
        operation: 'search_buffer',
        limit: 5,
        searchTerms: ['fantasy', 'meet'],
      },
      stage: 'legacy_search',
      query: 'fantasy, meet',
      confidence: 0.5,
      scoreSummary: 'hits=1',
      context: 'Retrieved transcript context for MissD:\nOperation: search_buffer(limit=5)',
      matchCount: 1,
      matchedMessageIds: ['message-1'],
      windowMessageIds: [['message-1', 'message-2']],
      evidenceMessageIds: ['message-1', 'message-2'],
    }],
  });

  assert.equal(plan.outcome, 'retrieve');
  assert.equal(plan.resolvedSubject, missD);
  assert.equal(plan.reusePreviousRetrievals, true);
  if (plan.outcome !== 'retrieve') {
    assert.fail('Expected a retrieval plan');
  }
  assert.equal(plan.requests[0]?.operation, 'fts_search');
  if (plan.requests[0]?.operation !== 'fts_search') {
    assert.fail('Expected an FTS retrieval request');
  }
  assert.ok(plan.requests[0].searchTerms.includes('hotel'));
});

test('follow-up recall without new terms reuses prior retrieval evidence instead of searching blindly', () => {
  const plan = planAssistantAskTurn({
    prompt: 'What was it?',
    queryBuffers,
    rememberedSubject: missD,
    selectedBuffer: missProxima,
    previousRetrievals: [{
      subject: missD,
      request: {
        operation: 'search_buffer',
        limit: 5,
        searchTerms: ['fantasy', 'meet'],
      },
      stage: 'legacy_search',
      query: 'fantasy, meet',
      confidence: 0.5,
      scoreSummary: 'hits=1',
      context: 'Retrieved transcript context for MissD:\nOperation: search_buffer(limit=5)',
      matchCount: 1,
      matchedMessageIds: ['message-1'],
      windowMessageIds: [['message-1', 'message-2']],
      evidenceMessageIds: ['message-1', 'message-2'],
    }],
  });

  assert.equal(plan.outcome, 'retrieve');
  assert.equal(plan.resolvedSubject, missD);
  assert.equal(plan.reusePreviousRetrievals, true);
  if (plan.outcome !== 'retrieve') {
    assert.fail('Expected a retrieval plan');
  }
  assert.equal(plan.requests[0]?.operation, 'fts_search');
});

test('implicit recollection prompts trigger transcript retrieval on the first turn', () => {
  const plan = planAssistantAskTurn({
    prompt: 'MissD and I have talked about a fantasy, the first time that we would meet in person. Can you remind me what it is?',
    queryBuffers,
    selectedBuffer: missD,
  });

  assert.equal(plan.outcome, 'retrieve');
  assert.equal(plan.resolvedSubject, missD);
  if (plan.outcome !== 'retrieve') {
    assert.fail('Expected a retrieval plan');
  }
  assert.equal(plan.requests[0]?.operation, 'fts_search');
  if (plan.requests[0]?.operation !== 'fts_search') {
    assert.fail('Expected an FTS retrieval request');
  }
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
  if (plan.outcome !== 'retrieve') {
    assert.fail('Expected a retrieval plan');
  }
  assert.equal(plan.requests[0]?.operation, 'fts_search');
  if (plan.requests[0]?.operation !== 'fts_search') {
    assert.fail('Expected an FTS retrieval request');
  }
  assert.ok(plan.requests[0].searchTerms.includes('fantasy'));
});

test('recent-history retrieval renders bounded transcript context', () => {
  const messages: ChatMessage[] = Array.from({ length: 3 }, (_, index) => ({
    id: `msg-${index + 1}`,
    networkId: 'network-1',
    target: 'MissD',
    nick: index % 2 === 0 ? 'MissD' : 'sofia',
    body: `message ${index + 1}`,
    kind: 'line' as const,
    self: false,
    ts: Date.parse('2026-03-25T12:00:00Z') + index * 60_000,
  }));

  const context = resolveAssistantAskRetrievedContext({
    subject: missD,
    messages,
    request: {
      operation: 'load_recent_buffer_messages',
      limit: 2,
    },
  });

  assert.match(context, /Operation: load_recent_buffer_messages/);
  assert.match(context, /Messages returned: 2/);
  assert.match(context, /message 2/);
  assert.match(context, /message 3/);
});

test('opening-history retrieval renders the first messages in the buffer', () => {
  const messages: ChatMessage[] = Array.from({ length: 3 }, (_, index) => ({
    id: `msg-${index + 1}`,
    networkId: 'network-1',
    target: 'MissD',
    nick: index % 2 === 0 ? 'MissD' : 'sofia',
    body: `opening ${index + 1}`,
    kind: 'line' as const,
    self: false,
    ts: Date.parse('2026-03-25T12:00:00Z') + index * 60_000,
  }));

  const context = resolveAssistantAskRetrievedContext({
    subject: missD,
    messages,
    request: {
      operation: 'load_opening_buffer_messages',
      limit: 2,
    },
  });

  assert.match(context, /Operation: load_opening_buffer_messages/);
  assert.match(context, /Messages returned: 2/);
  assert.match(context, /opening 1/);
  assert.match(context, /opening 2/);
});
