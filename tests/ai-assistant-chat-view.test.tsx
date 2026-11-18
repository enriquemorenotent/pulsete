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

  assert.match(markup, />How can I help\?</);
  assert.match(markup, /Catch me up/);
  assert.match(markup, /Help me reply/);
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
  assert.doesNotMatch(markup, /Catch me up|Recent messages|Saved history/);
});

test('assistant exposes Stop while a request is pending', () => {
  const markup = renderToStaticMarkup(<AiAssistantChatView entries={[]} error="" input=""
    pending pendingLabel="Thinking" onAsk={() => undefined} onCancel={() => undefined}
    onChange={() => undefined} onSubmit={() => undefined} onUseSuggestion={() => undefined} />);
  assert.match(markup, /aria-label="Stop response"/);
  assert.match(markup, /aria-busy="true"/);
});
