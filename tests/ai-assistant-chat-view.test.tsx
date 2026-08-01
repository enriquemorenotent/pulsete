import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { AiAssistantChatView } from '../web/src/AiAssistantChatView.js';

const renderView = (entries: Parameters<typeof AiAssistantChatView>[0]['entries'] = []) =>
  renderToStaticMarkup(
    <AiAssistantChatView
      entries={entries}
      error=""
      input=""
      pending={false}
      pendingLabel="Thinking"
      onAsk={() => undefined}
      onChange={() => undefined}
      onSubmit={() => undefined}
      onUseSuggestion={() => undefined}
    />,
  );

test('assistant empty state presents compact shortcuts and one composer', () => {
  const markup = renderView();

  assert.match(markup, />Start with a shortcut</);
  assert.match(markup, />Summarize</);
  assert.match(markup, />Catch me up</);
  assert.match(markup, /aria-label="Message assistant"/);
  assert.match(markup, /aria-label="Ask assistant"/);
});

test('assistant conversation replaces onboarding shortcuts with messages', () => {
  const markup = renderView([{
    id: 1,
    mode: 'answer',
    role: 'assistant',
    text: 'Here is the summary.',
  }]);

  assert.match(markup, /Here is the summary\./);
  assert.doesNotMatch(markup, /Start with a shortcut/);
  assert.doesNotMatch(markup, />Summarize</);
});
