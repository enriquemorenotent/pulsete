import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { AiAssistantSources } from '../web/src/AiAssistantSources.js';
import { AiAssistantConversation } from '../web/src/AiAssistantConversation.js';
import type { AiAssistantContext } from '../shared/protocol-ai.js';

const buffer = { id: 'buffer', networkId: 'network', kind: 'channel', target: '#test' } as const;
const context: AiAssistantContext = {
  buffer, messages: [],
  coverage: { description: 'Saved conversation history', truncated: true },
  sources: ['Meet at the bridge', 'Another unrelated excerpt'].map((body, index) => ({
    label: 'S' + (index + 1),
    message: { id: 'm' + index, bufferId: buffer.id, networkId: buffer.networkId, target: buffer.target,
      ts: new Date(2026, 5, 12).getTime(), kind: 'line', nick: 'alice', body, self: false },
  })),
  webSources: [{ label: 'W1', title: 'Public event page', url: 'https://example.test/event' }],
};

test('assistant replies show just the cited evidence without history coverage', () => {
  const markup = renderToStaticMarkup(<AiAssistantConversation
    showMedia
    entries={[{ id: 1, role: 'assistant', text: 'Meet at the bridge. [S1]', context }]}
    pending={false} pendingLabel="" onUseSuggestion={() => undefined} />);
  assert.match(markup, />Source<\/summary>/);
  assert.match(markup, /<blockquote[^>]+>Meet at the bridge<\/blockquote>/);
  assert.match(markup, /alice/);
  assert.doesNotMatch(markup, /\[S1\]|Another unrelated excerpt|Saved conversation history|Public event page/);
});

test('a web citation becomes a quiet external link', () => {
  const markup = renderToStaticMarkup(<AiAssistantSources chatSources={[]} webSources={context.webSources!} />);
  assert.match(markup, /href="https:\/\/example.test\/event"/);
  assert.match(markup, /title="Public event page"/);
  assert.match(markup, /target="_blank"/);
  assert.match(markup, />Web source</);
});
