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
  assert.match(markup, /aria-label="Avatar options for MissD"/);
  assert.match(markup, /data-avatar-source="initial"/);
  assert.match(markup, /-my-4 -ml-4 shrink-0[\s\S]*size-15[\s\S]*>M<\/span>/);
  assert.match(
    markup,
    /aria-label="WHOIS MissD"[\s\S]*aria-label="Search history"[\s\S]*aria-label="Download history"[\s\S]*aria-label="Delete history"[\s\S]*aria-label="Close MissD"/,
  );
  assert.match(markup, /sm:hidden[\s\S]*aria-label="More actions"/);
  assert.doesNotMatch(markup, />Search history</);
  assert.doesNotMatch(markup, />Download history</);
  assert.doesNotMatch(markup, />Delete history</);
});
