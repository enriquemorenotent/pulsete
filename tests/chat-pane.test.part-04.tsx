import assert from 'node:assert/strict';
import test from 'node:test';
import { makeMessage } from './chat-pane.test.fixtures.js';
import { renderChatPane, renderQueryPane } from './chat-pane.test.renderers.js';

test('nick emoji tags render beside chat participant labels', () => {
  const markup = renderChatPane([
    makeMessage({ id: 'message-1', nick: 'Joby', body: 'tagged', ts: 1 }),
  ], {
    nickEmojis: [{ id: 'nick-emoji-1', networkId: 'network-1', nick: 'joby', emoji: '🌙' }],
  });

  assert.match(
    markup,
    />Joby<span aria-hidden="true" class="ml-1 font-sans normal-case tracking-normal">🌙<\/span>/,
  );
  assert.match(markup, /aria-label="Open private message with Joby"/);
});

test('query headers show nick emoji tags', () => {
  const markup = renderQueryPane([], {
    nickEmojis: [{ id: 'nick-emoji-1', networkId: 'network-1', nick: 'MissD', emoji: '🌙' }],
  });

  assert.match(
    markup,
    /<span class="truncate">MissD<\/span><span aria-hidden="true" class="shrink-0 leading-none">🌙<\/span>/,
  );
});
