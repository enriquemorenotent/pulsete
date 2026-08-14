import assert from 'node:assert/strict';
import test from 'node:test';
import { renderChatPane, renderQueryPane, renderServerPane } from './chat-pane.test.renderers.js';

test('channel composers rely on the placeholder for target context', () => {
  const markup = renderChatPane([], { draft: 'already typing' });

  assert.doesNotMatch(markup, /aria-label="Composer target/);
  assert.match(markup, /placeholder="Message #help/);
  assert.match(markup, /value="already typing"/);
});

test('query composers rely on the placeholder for peer context', () => {
  const markup = renderQueryPane([], { draft: 'private draft' });

  assert.doesNotMatch(markup, /aria-label="Composer target/);
  assert.match(markup, /placeholder="Message MissD/);
  assert.match(markup, /value="private draft"/);
});

test('server composers retain the command prompt without a target chip', () => {
  const markup = renderServerPane([], { draft: '/join #help' });

  assert.doesNotMatch(markup, /aria-label="Composer target/);
  assert.match(markup, />\/</);
  assert.match(markup, />Run</);
  assert.match(markup, /value="\/join #help"/);
});
