import assert from 'node:assert/strict';
import test from 'node:test';
import { makeMessage } from './chat-pane.test.fixtures.js';
import { renderChatPane } from './chat-pane.test.renderers.js';

test('chat transcripts collapse muted messages behind a placeholder row', () => {
  const markup = renderChatPane(
    [
      makeMessage({ id: 'message-1', nick: 'missd', body: 'first hidden line' }),
      makeMessage({ id: 'message-2', nick: 'MissD', body: 'second hidden line', ts: 2 }),
      makeMessage({ id: 'message-3', nick: 'Joby', body: 'visible reply', ts: 3 }),
    ],
    {
      mutedNicks: [{ id: 'mute-1', networkId: 'network-1', nick: 'MissD' }],
    },
  );

  assert.match(markup, /aria-label="Show 2 muted messages from MissD"/);
  assert.match(markup, />2 muted messages from MissD</);
  assert.match(markup, /visible reply/);
  assert.doesNotMatch(markup, /first hidden line/);
  assert.doesNotMatch(markup, /second hidden line/);
});
