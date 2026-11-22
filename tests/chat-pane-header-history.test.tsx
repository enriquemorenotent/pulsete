import assert from 'node:assert/strict';
import test from 'node:test';
import { renderQueryPane } from './chat-pane.test.renderers.js';

test('query headers keep the history search visible and put download and delete in More', () => {
  const markup = renderQueryPane([], {
    canDeleteHistory: true,
    canDownloadHistory: true,
    canSearchHistory: true,
  });

  assert.match(markup, /aria-label="Search history"[\s\S]*aria-label="More actions"[\s\S]*aria-label="Close MissD"/);
  assert.doesNotMatch(markup, /aria-label="(?:Download history|Delete history)"/);
  assert.match(markup, /-my-4 -ml-4 shrink-0[\s\S]*size-15[\s\S]*>M<\/span>/);
});
