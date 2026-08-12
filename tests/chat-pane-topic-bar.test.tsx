import assert from 'node:assert/strict';
import test from 'node:test';
import { renderChatPane } from './chat-pane.test.renderers.js';

test('channel topics render links in a dedicated wrapped row', () => {
  const markup = renderChatPane([], {
    topic: 'Rules at https://example.test/rules and idle in #lounge',
  });

  assert.match(markup, /href="https:\/\/example\.test\/rules"/);
  assert.match(markup, />#lounge</);
});

test('long channel topics render a compact preview with an expansion control', () => {
  const markup = renderChatPane([], {
    topic: 'Rules at https://example.test/rules and idle in #lounge before posting. This topic continues with conduct notes, command hints, and final admin instructions.',
  });

  assert.match(markup, /href="https:\/\/example\.test\/rules"/);
  assert.match(markup, />#lounge</);
  assert.doesNotMatch(markup, />Topic</);
  assert.match(markup, /aria-label="Show full channel description"/);
  assert.match(markup, /aria-expanded="false"/);
  assert.doesNotMatch(markup, /final admin instructions/);
});
