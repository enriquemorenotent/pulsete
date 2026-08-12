import assert from 'node:assert/strict';
import test from 'node:test';
import { renderChatPane, renderQueryPane, renderServerPane } from './chat-pane.test.renderers.js';

test('channel composers keep the target visible while drafting', () => {
  const markup = renderChatPane([], { draft: 'already typing' });

  assert.match(markup, /aria-label="Composer target #help"/);
  assert.match(markup, /value="already typing"/);
});

test('query composers keep the peer visible while drafting', () => {
  const markup = renderQueryPane([], { draft: 'private draft' });

  assert.match(markup, /aria-label="Composer target MissD"/);
  assert.match(markup, /value="private draft"/);
});

test('server composers keep command mode visually tied to the server', () => {
  const markup = renderServerPane([], { draft: '/join #help' });

  assert.match(markup, /aria-label="Composer target Cuff-Link"/);
  assert.match(markup, />\/</);
  assert.match(markup, />Run</);
  assert.match(markup, /value="\/join #help"/);
});
