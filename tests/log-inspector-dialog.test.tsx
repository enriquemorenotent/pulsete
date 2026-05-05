import assert from 'node:assert/strict';
import test from 'node:test';
import { createRef } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Dialog } from '../web/src/components/ui/dialog.js';
import {
  LogInspectorDialogBody,
} from '../web/src/LogInspectorDialog.js';
import type { HistorySearchState } from '../web/src/HistorySearchDialog.js';
import { makeMessage, makeNetwork } from './chat-pane.test.fixtures.js';

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
    networkValue: string;
    query: string;
    target: string;
  }> = {},
) =>
  renderToStaticMarkup(
    <Dialog open>
      <LogInspectorDialogBody
        expandedMessageId={overrides.expandedMessageId ?? null}
        inputRef={createRef<HTMLInputElement>()}
        networkValue={overrides.networkValue ?? '__all__'}
        networks={[makeNetwork({ id: 'network-1', name: 'Cuff-Link' })]}
        query={overrides.query ?? ''}
        searchState={searchState}
        target={overrides.target ?? ''}
        onNetworkChange={() => undefined}
        onQueryChange={() => undefined}
        onResultToggle={() => undefined}
        onSubmit={(event) => event.preventDefault()}
        onTargetChange={() => undefined}
      />
    </Dialog>
  );

test('log inspector body renders global search controls', () => {
  const markup = renderBody(idleState);

  assert.match(markup, /Log inspector/);
  assert.match(markup, /aria-label="Search all logs"/);
  assert.match(markup, /aria-label="Filter logs by network"/);
  assert.match(markup, /aria-label="Filter logs by conversation"/);
  assert.match(markup, /disabled=""/);
  assert.match(markup, /Enter a search term\./);
});

test('log inspector body labels results by network and conversation', () => {
  const match = makeMessage({
    id: 'message-2',
    body: 'needle line',
    networkId: 'network-1',
    target: '#help',
    ts: 2,
  });
  const searchState: HistorySearchState = {
    status: 'loaded',
    query: 'needle',
    results: [{
      message: match,
      context: [
        makeMessage({ id: 'message-1', body: 'before', ts: 1 }),
        match,
        makeMessage({ id: 'message-3', body: 'after', ts: 3 }),
      ],
    }],
    hasMore: false,
    error: null,
  };
  const markup = renderBody(searchState, {
    expandedMessageId: 'message-2',
    query: 'needle',
  });

  assert.match(markup, /Cuff-Link/);
  assert.match(markup, /#help/);
  assert.match(markup, /needle line/);
  assert.match(markup, /before/);
  assert.match(markup, /after/);
  assert.match(markup, /data-active="true"/);
});
