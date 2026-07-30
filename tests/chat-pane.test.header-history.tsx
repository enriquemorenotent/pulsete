import assert from 'node:assert/strict';
import test from 'node:test';
import { renderQueryPane } from './chat-pane.test.renderers.js';

test('query headers expose one-click history controls', () => {
  const markup = renderQueryPane([], {
    canDeleteHistory: true,
    canDownloadHistory: true,
    canSearchHistory: true,
  });

  assert.match(markup, /aria-label="Search history"/);
  assert.match(markup, /aria-label="Download history"/);
  assert.match(markup, /aria-label="Delete history"/);
  assert.match(
    markup,
    /aria-label="WHOIS MissD"[\s\S]*aria-label="Search history"[\s\S]*aria-label="Download history"[\s\S]*aria-label="Delete history"[\s\S]*aria-label="Close MissD"/,
  );
  assert.doesNotMatch(markup, /aria-label="More actions"/);
  assert.doesNotMatch(markup, />Search history</);
  assert.doesNotMatch(markup, />Download history</);
  assert.doesNotMatch(markup, />Delete history</);
});
