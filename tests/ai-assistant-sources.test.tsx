import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { AiAssistantSources } from '../web/src/AiAssistantSources.js';

test('source details show actual supplied excerpts, timestamps and incomplete coverage', () => {
  const markup = renderToStaticMarkup(<AiAssistantSources sourcePrefix="assistant-source-1" context={{
    buffer: { id: 'buffer', networkId: 'network', kind: 'channel', target: '#test' }, messages: [],
    coverage: { description: 'Saved conversation history', truncated: true },
    sources: [{ label: 'S1', message: { id: 'm1', bufferId: 'buffer', networkId: 'network',
      target: '#test', ts: new Date(2026, 5, 12).getTime(), kind: 'line', nick: 'alice',
      body: 'Meet at the bridge', self: false } }],
  }} />);
  assert.match(markup, /Sources \(1\).*Incomplete history/);
  assert.match(markup, /assistant-source-1-S1/);
  assert.match(markup, /Meet at the bridge/);
  assert.match(markup, /alice/);
  assert.match(markup, /sent to OpenAI/);
});
