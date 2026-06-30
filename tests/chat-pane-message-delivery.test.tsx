import assert from 'node:assert/strict';
import test from 'node:test';
import { makeMessage } from './chat-pane.test.fixtures.js';
import { renderChatPane } from './chat-pane.test.renderers.js';

test('server-history messages render with a quiet row cue', () => {
  const markup = renderChatPane([
    makeMessage({
      id: 'message-1',
      body: 'before you joined',
      delivery: 'server-history',
      ts: 1,
    }),
  ]);

  assert.match(markup, /data-message-delivery="server-history"/);
  assert.ok(markup.includes('bg-cyan-400/[0.045]'));
  assert.ok(markup.includes('shadow-[inset_2px_0_0_rgb(103_232_249_/_0.28)]'));
  assert.doesNotMatch(markup, /Server history/);
});

test('live messages do not render the server-history cue', () => {
  const markup = renderChatPane([
    makeMessage({ id: 'message-1', body: 'current line', ts: 1 }),
  ]);

  assert.doesNotMatch(markup, /data-message-delivery=/);
  assert.ok(!markup.includes('bg-cyan-400/[0.045]'));
});
