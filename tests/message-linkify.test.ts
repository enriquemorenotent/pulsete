import assert from 'node:assert/strict';
import test from 'node:test';
import { linkifyMessageText } from '../web/src/message-linkify.js';

test('linkifies urls and preserves surrounding punctuation', () => {
  const tokens = linkifyMessageText('Docs: https://example.com/test?q=1).');

  assert.deepEqual(tokens, [
    { type: 'text', value: 'Docs: ' },
    { type: 'link', value: 'https://example.com/test?q=1', href: 'https://example.com/test?q=1', external: true },
    { type: 'text', value: ').' },
  ]);
});

test('linkifies bare www urls with https', () => {
  const tokens = linkifyMessageText('Visit www.example.com now');

  assert.deepEqual(tokens, [
    { type: 'text', value: 'Visit ' },
    { type: 'link', value: 'www.example.com', href: 'https://www.example.com', external: true },
    { type: 'text', value: ' now' },
  ]);
});

test('linkifies email addresses with mailto', () => {
  const tokens = linkifyMessageText('Contact admin@example.com for access');

  assert.deepEqual(tokens, [
    { type: 'text', value: 'Contact ' },
    { type: 'link', value: 'admin@example.com', href: 'mailto:admin@example.com', external: false },
    { type: 'text', value: ' for access' },
  ]);
});

test('linkifies channel names and preserves surrounding brackets', () => {
  const tokens = linkifyMessageText('Ask in [#help] first');

  assert.deepEqual(tokens, [
    { type: 'text', value: 'Ask in [' },
    { type: 'channel', value: '#help', channel: '#help' },
    { type: 'text', value: '] first' },
  ]);
});

test('does not turn issue fragments into channel links', () => {
  const tokens = linkifyMessageText('see bug#123 before merging');

  assert.deepEqual(tokens, [{ type: 'text', value: 'see bug#123 before merging' }]);
});

test('leaves plain text unchanged when there is nothing to linkify', () => {
  const tokens = linkifyMessageText('no links here');

  assert.deepEqual(tokens, [{ type: 'text', value: 'no links here' }]);
});
