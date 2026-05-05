import assert from 'node:assert/strict';
import test from 'node:test';
import { makeMessage } from './chat-pane.test.fixtures.js';
import { renderChatPane } from './chat-pane.test.renderers.js';

test('chat pane holds a stable loading surface while initial history is pending', () => {
  const markup = renderChatPane(
    [
      makeMessage({ id: 'message-1', body: 'partial live row', ts: 1 }),
      makeMessage({ id: 'message-2', body: 'another partial row', ts: 2 }),
    ],
    { initialHistoryPending: true },
  );

  assert.match(markup, /Loading messages/);
  assert.doesNotMatch(markup, /partial live row/);
  assert.doesNotMatch(markup, /another partial row/);
  assert.doesNotMatch(markup, /data-message-id="message-1"/);
});
