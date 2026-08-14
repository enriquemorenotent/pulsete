import assert from 'node:assert/strict';
import test from 'node:test';
import { formatTranscriptMessageForCopy } from '../web/src/transcript/copy.js';
import { makeMessage } from './chat-pane.test.fixtures.js';

test('transcript copy text is a plain readable chat line', () => {
  const timestamp = new Date(2026, 2, 11, 14, 41, 0, 0).getTime();

  assert.equal(
    formatTranscriptMessageForCopy(
      makeMessage({ nick: 'silke', body: 'See you later, My Bull', ts: timestamp }),
    ),
    '[14:41] silke: See you later, My Bull',
  );
});

test('transcript copy text supports display labels and senderless messages', () => {
  const timestamp = new Date(2026, 2, 11, 14, 41, 0, 0).getTime();
  const message = makeMessage({ nick: null, body: '* Welcome', ts: timestamp });

  assert.equal(
    formatTranscriptMessageForCopy(message, 'server', 'Welcome'),
    '[14:41] server: Welcome',
  );
  assert.equal(
    formatTranscriptMessageForCopy(message),
    '[14:41] * Welcome',
  );
});
