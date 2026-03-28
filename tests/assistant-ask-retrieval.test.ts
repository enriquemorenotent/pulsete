import assert from 'node:assert/strict';
import test from 'node:test';
import type { ChatMessage } from '../shared/protocol.js';
import {
  resolveAssistantAskRetrieval,
  resolveAssistantAskRetrievedContext,
} from '../server/assistant-ask-planner.js';
import { buildLineMessage, missD } from './helpers/assistant-ask-fixtures.js';

test('recent-history retrieval renders bounded transcript context', () => {
  const messages: ChatMessage[] = Array.from({ length: 3 }, (_, index) => buildLineMessage({
    id: `msg-${index + 1}`,
    nick: index % 2 === 0 ? 'MissD' : 'sofia',
    body: `message ${index + 1}`,
    self: index % 2 === 1,
    ts: Date.parse('2026-03-25T12:00:00Z') + index * 60_000,
  }));
  const context = resolveAssistantAskRetrievedContext({
    subject: missD,
    messages,
    request: { operation: 'load_recent_buffer_messages', limit: 2 },
  });
  assert.match(context, /Operation: load_recent_buffer_messages/);
  assert.match(context, /Messages returned: 2/);
  assert.match(context, /Excerpt:/);
  assert.match(context, /2026-03-25/);
  assert.match(context, /sofia: message 2/);
  assert.match(context, /MissD: message 3/);
});

test('opening-history retrieval renders the first messages in the buffer', () => {
  const messages: ChatMessage[] = Array.from({ length: 3 }, (_, index) => buildLineMessage({
    id: `msg-${index + 1}`,
    nick: index % 2 === 0 ? 'MissD' : 'sofia',
    body: `opening ${index + 1}`,
    self: index % 2 === 1,
    ts: Date.parse('2026-03-25T12:00:00Z') + index * 60_000,
  }));
  const context = resolveAssistantAskRetrievedContext({
    subject: missD,
    messages,
    request: { operation: 'load_opening_buffer_messages', limit: 2 },
  });
  assert.match(context, /Operation: load_opening_buffer_messages/);
  assert.match(context, /Messages returned: 2/);
  assert.match(context, /Excerpt:/);
  assert.match(context, /MissD: opening 1/);
  assert.match(context, /sofia: opening 2/);
});

test('profile-fact retrieval prefers direct origin question and answer windows', () => {
  const messages: ChatMessage[] = [
    buildLineMessage({ id: 'msg-1', nick: 'sofia', body: 'Where are you from?', self: true, ts: Date.parse('2025-10-31T01:31:00Z') }),
    buildLineMessage({ id: 'msg-2', nick: 'sofia', body: 'West coast is USA?', self: true, ts: Date.parse('2025-10-31T01:31:30Z') }),
    buildLineMessage({ id: 'msg-3', nick: 'MissD', body: 'yes.. california', self: false, ts: Date.parse('2025-10-31T01:32:00Z') }),
    buildLineMessage({ id: 'msg-4', nick: 'MissD', body: 'What brings you here?', self: false, ts: Date.parse('2025-10-31T01:32:30Z') }),
  ];
  const retrieval = resolveAssistantAskRetrieval({
    subject: missD,
    messages,
    request: {
      operation: 'profile_fact_search',
      intent: 'origin_location',
      limit: 5,
      query: 'where, from, west coast',
      searchTerms: ['where', 'from', 'west coast'],
    },
  });
  assert.equal(retrieval.stage, 'profile_fact_search');
  assert.match(retrieval.context, /Operation: profile_fact_search\(intent=origin_location, limit=5\)/);
  assert.match(retrieval.context, /Strategy: question-answer windows/);
  assert.deepEqual(retrieval.matchedMessageIds, ['msg-1', 'msg-2', 'msg-3']);
  assert.equal(retrieval.evidenceGroups?.[0]?.heading, '2025-10-31');
});

test('fts retrieval stores deterministic evidence groups with exact speaker labels', () => {
  const messages: ChatMessage[] = [
    buildLineMessage({ id: 'msg-1', nick: 'MissD', body: 'that would be our bed, only for us 2', self: false, ts: Date.parse('2026-03-23T06:11:00Z') }),
    buildLineMessage({ id: 'msg-2', nick: 'sofia', body: 'My other marital bed.', self: true, ts: Date.parse('2026-03-23T06:12:00Z') }),
    buildLineMessage({ id: 'msg-3', nick: 'MissD', body: 'unrelated line', self: false, ts: Date.parse('2026-03-24T01:00:00Z') }),
  ];
  const retrieval = resolveAssistantAskRetrieval({
    subject: missD,
    messages,
    request: { operation: 'fts_search', limit: 5, query: 'bed', searchTerms: ['bed'] },
  });
  assert.deepEqual(retrieval.evidenceGroups, [{
    heading: '2026-03-23',
    lines: [
      { messageId: 'msg-1', speakerRole: undefined, speakerNick: 'MissD', attributionConfidence: undefined, body: 'that would be our bed, only for us 2', kind: 'line' },
      { messageId: 'msg-2', speakerRole: undefined, speakerNick: 'sofia', attributionConfidence: undefined, body: 'My other marital bed.', kind: 'line' },
    ],
  }]);
});
