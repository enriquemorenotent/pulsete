import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAssistantHistoryPackage } from '../server/assistant-history-package.js';
import type { ChatMessage } from '../shared/protocol.js';

const makeMessage = (index: number, body: string): ChatMessage => ({
  id: `message-${index}`,
  networkId: 'network-1',
  target: 'alice',
  nick: index % 2 === 0 ? 'alice' : 'me',
  body,
  kind: 'line',
  self: index % 2 === 1,
  ts: Date.parse('2026-01-01T08:00:00Z') + index * 60_000,
});

test('assistant history package adds exact opening excerpts for long positional queries', () => {
  const messages = [
    ...Array.from({ length: 30 }, (_, index) => makeMessage(index, `opening ${index}`)),
    ...Array.from({ length: 800 }, (_, index) => makeMessage(index + 30, `filler ${index} `.repeat(8).trim())),
  ];

  const history = buildAssistantHistoryPackage({
    messages,
    prompt: 'Summarize the first 20 messages that I had with this person',
    task: 'ask',
  });

  const focus = history.attachments.find((attachment) => attachment.name === 'history-query-focus.txt');
  assert.ok(focus);
  assert.equal(focus.kind, 'text');
  assert.match(focus.text, /First 20 messages/);
  assert.match(focus.text, /opening 0/);
  assert.match(focus.text, /opening 19/);
  assert.match(history.context, /Additional history package:/);
});

test('assistant history package emits indexed transcript attachments for long histories', () => {
  const messages = [
    makeMessage(0, 'We talked about chess.'),
    ...Array.from({ length: 900 }, (_, index) =>
      makeMessage(index + 1, `long transcript ${index} `.repeat(8).trim())),
  ];

  const history = buildAssistantHistoryPackage({
    messages,
    prompt: 'When did we talk about chess?',
    task: 'ask',
  });

  assert.ok(history.attachments.some((attachment) => attachment.name === 'history-index.txt'));
  assert.ok(history.attachments.some((attachment) => attachment.name.startsWith('history-transcript-')));
});

test('assistant history package labels self-authored transcript lines as you (nick)', () => {
  const history = buildAssistantHistoryPackage({
    messages: [
      makeMessage(0, 'hello there'),
      makeMessage(1, 'I will wait in the hotel lobby'),
    ],
    prompt: 'What did I say about the hotel?',
    task: 'ask',
  });

  assert.match(history.context, /you \(me\): I will wait in the hotel lobby/);
});
