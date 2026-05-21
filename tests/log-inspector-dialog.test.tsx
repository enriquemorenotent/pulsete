import assert from 'node:assert/strict';
import test from 'node:test';
import { createRef } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Dialog } from '../web/src/components/ui/dialog.js';
import {
  LogInspectorDialogBody,
} from '../web/src/LogInspectorDialog.js';
import type { HistorySearchState } from '../web/src/HistorySearchDialog.js';
import type { LogSource } from '../shared/protocol-chat.js';
import { makeBuffer, makeMessage, makeNetwork } from './chat-pane.test.fixtures.js';

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
    activeMode: 'sources' | 'search';
    expandedMessageId: string | null;
    networkValue: string;
    query: string;
    selectedSource: LogSource | null;
    sourceHistoryMessages: ReturnType<typeof makeMessage>[];
    sourceState: 'idle' | 'loading' | 'loaded' | 'error';
    target: string;
  }> = {},
) =>
  renderToStaticMarkup(
    <Dialog open>
      <LogInspectorDialogBody
        activeMode={overrides.activeMode ?? 'sources'}
        expandedMessageId={overrides.expandedMessageId ?? null}
        inputRef={createRef<HTMLInputElement>()}
        loadingOlderSourceHistory={false}
        mutedNicks={[]}
        networkValue={overrides.networkValue ?? '__all__'}
        networks={[makeNetwork({ id: 'network-1', name: 'Cuff-Link' })]}
        nickEmojis={[]}
        query={overrides.query ?? ''}
        searchState={searchState}
        selectedSource={overrides.selectedSource ?? null}
        sourceHistoryState={{
          status: overrides.sourceHistoryMessages ? 'loaded' : 'idle',
          messages: overrides.sourceHistoryMessages ?? [],
          hasMore: false,
          error: null,
        }}
        sourceKindValue="__all_source_kinds__"
        sourceQuery=""
        sourceState={{
          status: overrides.sourceState ?? 'idle',
          query: '',
          sources: overrides.selectedSource ? [overrides.selectedSource] : [],
          error: null,
        }}
        target={overrides.target ?? ''}
        onActiveModeChange={() => undefined}
        onNetworkChange={() => undefined}
        onQueryChange={() => undefined}
        onResultToggle={() => undefined}
        onSourceKindChange={() => undefined}
        onSourceLoadOlder={() => undefined}
        onSourceQueryChange={() => undefined}
        onSourceSelect={() => undefined}
        onSourceSubmit={(event) => event.preventDefault()}
        onSubmit={(event) => event.preventDefault()}
        onTargetChange={() => undefined}
      />
    </Dialog>
  );

test('log inspector body renders source browser controls', () => {
  const markup = renderBody(idleState);

  assert.match(markup, /Log inspector/);
  assert.match(markup, /Sources/);
  assert.match(markup, /aria-label="Find log source"/);
  assert.match(markup, /aria-label="Filter sources by type"/);
  assert.match(markup, /Browse saved sources\./);
});

test('log inspector body renders global search controls', () => {
  const markup = renderBody(idleState, { activeMode: 'search' });

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
    activeMode: 'search',
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

test('log inspector body renders selected source transcript', () => {
  const source: LogSource = {
    aliases: ['MissD'],
    buffer: makeBuffer({
      id: 'query-1',
      kind: 'query',
      networkId: 'network-1',
      target: 'Guide',
    }),
    firstMessageTs: 1,
    lastMessageTs: 2,
    messageCount: 2,
    open: false,
  };
  const markup = renderBody(idleState, {
    activeMode: 'sources',
    selectedSource: source,
    sourceHistoryMessages: [
      makeMessage({
        id: 'source-message-1',
        bufferId: 'query-1',
        body: 'private line',
        networkId: 'network-1',
        target: 'Guide',
      }),
    ],
    sourceState: 'loaded',
  });

  assert.match(markup, /Guide/);
  assert.match(markup, /Cuff-Link/);
  assert.match(markup, /PM/);
  assert.match(markup, /Closed/);
  assert.match(markup, /aka MissD/);
  assert.match(markup, /private line/);
});
