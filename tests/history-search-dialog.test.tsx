import assert from 'node:assert/strict';
import test from 'node:test';
import { createRef } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Dialog } from '../web/src/components/ui/dialog.js';
import {
  HistorySearchDialogBody,
  type HistorySearchState,
} from '../web/src/HistorySearchDialog.js';
import { makeMessage } from './chat-pane.test.fixtures.js';

const idleState: HistorySearchState = {
  status: 'idle',
  query: '',
  results: [],
  hasMore: false,
  error: null,
};

const renderBody = (
  searchState: HistorySearchState,
  overrides: Partial<{
    expandedMessageId: string | null;
    query: string;
  }> = {},
) =>
  renderToStaticMarkup(
    <Dialog open>
      <HistorySearchDialogBody
        expandedMessageId={overrides.expandedMessageId ?? null}
        inputRef={createRef<HTMLInputElement>()}
        mode="colors"
        query={overrides.query ?? ''}
        searchState={searchState}
        title="#help"
        onOpenChannel={() => undefined}
        onQueryChange={() => undefined}
        onResultToggle={() => undefined}
        onSubmit={(event) => event.preventDefault()}
      />
    </Dialog>
  );

test('history search dialog body keeps search controls above a flexible results pane', () => {
  const markup = renderBody(idleState);

  assert.match(markup, /class="flex h-full min-h-0 flex-col"/);
  assert.match(markup, /aria-label="Search message history"/);
  assert.match(markup, /disabled=""/);
  assert.match(markup, /Enter a search term\./);
  assert.match(markup, /class="relative overflow-hidden min-h-0 flex-1"/);
});

test('history search dialog body renders expanded context around a selected result', () => {
  const match = makeMessage({ id: 'message-2', nick: 'Alice', body: 'needle line', ts: 2 });
  const searchState: HistorySearchState = {
    status: 'loaded',
    query: 'needle',
    results: [{
      message: match,
      context: [
        makeMessage({ id: 'message-1', nick: 'Bob', body: 'before', ts: 1 }),
        match,
        makeMessage({ id: 'message-3', nick: 'Cora', body: 'after', ts: 3 }),
      ],
    }],
    hasMore: true,
    error: null,
  };
  const markup = renderBody(searchState, {
    expandedMessageId: 'message-2',
    query: 'needle',
  });

  assert.match(markup, /needle line/);
  assert.match(markup, /before/);
  assert.match(markup, /after/);
  assert.match(markup, /data-active="true"/);
  assert.match(markup, /Showing first results/);
});

test('history results keep lifecycle media URLs as links without previews', () => {
  const url = 'https://cdn.example.com/client.png';
  const message = makeMessage({
    id: 'quit-message',
    body: `Alice quit (${url})`,
    kind: 'quit',
  });
  const markup = renderBody({
    status: 'loaded',
    query: 'client',
    results: [{ message, context: [message] }],
    hasMore: false,
    error: null,
  }, {
    expandedMessageId: message.id,
    query: 'client',
  });

  assert.match(markup, /href="https:\/\/cdn\.example\.com\/client\.png"/);
  assert.doesNotMatch(markup, /<img/);
  assert.doesNotMatch(markup, /<video/);
});
