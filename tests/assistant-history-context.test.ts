import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAssistantHistoryContext } from '../server/assistant-history-context.js';
import type { ChatMessage } from '../shared/protocol.js';

test('assistant history context includes the full transcript when it fits', () => {
  const messages: ChatMessage[] = [{
    id: 'message-1',
    networkId: 'network-1',
    target: '#general',
    nick: 'alice',
    body: 'hello there',
    kind: 'line',
    self: false,
    ts: Date.parse('2026-03-23T18:00:00Z'),
  }];

  const context = buildAssistantHistoryContext({
    messages,
    prompt: 'What did Alice say?',
    task: 'ask',
  });

  assert.match(context, /History coverage: full buffer history/);
  assert.match(context, /Full transcript:/);
  assert.match(context, /hello there/);
});

test('assistant history context packs older matching windows when the transcript is large', () => {
  const anchorMessage: ChatMessage = {
    id: 'anchor',
    networkId: 'network-1',
    target: '#general',
    nick: 'alice',
    body: 'We decided to use postgres for analytics storage.',
    kind: 'line',
    self: false,
    ts: Date.parse('2026-01-10T08:00:00Z'),
  };
  const noise = Array.from({ length: 700 }, (_, index) => ({
    id: `noise-${index}`,
    networkId: 'network-1',
    target: '#general',
    nick: 'bot',
    body: `daily chatter ${index} `.repeat(6).trim(),
    kind: 'line' as const,
    self: false,
    ts: Date.parse('2026-02-01T09:00:00Z') + index * 60_000,
  }));

  const context = buildAssistantHistoryContext({
    messages: [anchorMessage, ...noise],
    prompt: 'When did we talk about postgres?',
    task: 'ask',
  });

  assert.doesNotMatch(context, /Full transcript:/);
  assert.match(context, /Prompt search terms: .*postgres/);
  assert.match(context, /Historical windows:/);
  assert.match(context, /use postgres for analytics storage/);
  assert.match(context, /Recent tail:/);
});

test('assistant history context formats action messages as transcript actions', () => {
  const messages: ChatMessage[] = [{
    id: 'message-1',
    networkId: 'network-1',
    target: '#general',
    nick: 'alice',
    body: 'waves',
    kind: 'action',
    self: false,
    ts: Date.parse('2026-03-23T18:00:00Z'),
  }];

  const context = buildAssistantHistoryContext({
    messages,
    prompt: 'What happened?',
    task: 'ask',
  });

  assert.match(context, /\* alice waves/);
  assert.doesNotMatch(context, /alice: waves/);
});

test('assistant history context formats quit messages as channel events', () => {
  const messages: ChatMessage[] = [{
    id: 'message-1',
    networkId: 'network-1',
    target: '#general',
    nick: 'alice',
    body: 'alice quit (bye)',
    kind: 'quit',
    self: false,
    ts: Date.parse('2026-03-23T18:00:00Z'),
  }];

  const context = buildAssistantHistoryContext({
    messages,
    prompt: 'Who left?',
    task: 'ask',
  });

  assert.match(context, /\(quit\) alice quit \(bye\)/);
  assert.doesNotMatch(context, /alice: alice quit/);
});
