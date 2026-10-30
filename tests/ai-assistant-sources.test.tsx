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

test('research coverage distinguishes inspected excerpts from all searchable history and shows the limit', () => {
  const markup = renderToStaticMarkup(<AiAssistantSources sourcePrefix="assistant-source-research" context={{
    buffer: { id: 'buffer', networkId: 'network', kind: 'channel', target: '#test' }, messages: [], sources: [],
    coverage: { description: 'Searched saved history of this conversation', truncated: true,
      totalMessages: 12000, inspectedMessages: 40, firstTs: 1700000000000, lastTs: 1800000000000,
      researchLimited: true },
  }} />);
  assert.match(markup, /40 messages used · 12000 saved/);
  assert.match(markup, /Saved dates:/);
  assert.match(markup, /Search limit reached/);
});
