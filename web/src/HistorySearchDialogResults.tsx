import { Button } from '@/components/ui/button.js';
import { highlightSearchText } from './highlight-search-text.js';
import type { BufferHistorySearchResult, ChatMessage } from '../../shared/protocol-chat.js';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils.js';
import {
  formatMessageTimestampDateTime,
  formatMessageTimestampTitle,
  messageTone,
  resolveMessageInlineImageRendering,
} from './chat-pane-message-utils.js';
import {
  FormattedMessageText,
  type InlineImageRenderingMode,
} from './FormattedMessageText.js';
import type { HistorySearchState } from './HistorySearchDialog.js';
import type { MessageDisplayMode } from './message-display-mode.js';

export function HistorySearchResults(props: {
  loadingMore?: boolean;
  pageError?: string | null;
  onLoadMore?: () => void;
  expandedMessageId: string | null;
  inlineImageRendering?: InlineImageRenderingMode;
  mode: MessageDisplayMode;
  searchState: HistorySearchState;
  renderResultMeta?: (message: ChatMessage) => ReactNode;
  onOpenChannel: (channel: string) => void;
  onResultToggle: (messageId: string) => void;
}) {
  const { searchState } = props;
  if (searchState.status === 'idle') {
    return <EmptySearchState>Enter a search term.</EmptySearchState>;
  }
  if (searchState.status === 'loading') {
    return <EmptySearchState>Searching...</EmptySearchState>;
  }
  if (searchState.status === 'error') {
    return <EmptySearchState>{searchState.error ?? 'Failed to search history'}</EmptySearchState>;
  }
  if (searchState.results.length === 0) {
    return <EmptySearchState>No results for "{searchState.query}".</EmptySearchState>;
  }
  return (
    <div className="flex flex-col gap-1 p-2">
      <p className="px-2 py-1 text-xs text-muted-foreground" role="status">{searchState.results.length} {searchState.results.length === 1 ? 'result' : 'results'}{searchState.hasMore ? ' · more available' : ''}</p>
      {searchState.results.map((result) => (
        <HistorySearchResultRow
          key={result.message.id}
          query={searchState.query}
          expanded={props.expandedMessageId === result.message.id}
          inlineImageRendering={props.inlineImageRendering}
          mode={props.mode}
          result={result}
          resultMeta={props.renderResultMeta?.(result.message)}
          onOpenChannel={props.onOpenChannel}
          onToggle={() => props.onResultToggle(result.message.id)}
        />
      ))}
      {props.pageError ? <p role="alert" className="px-2 py-2 text-sm text-destructive">{props.pageError}</p> : null}
      {searchState.hasMore ? (
        <div className="flex justify-center px-2 py-3">
          {props.onLoadMore ? (
            <Button variant="outline" disabled={props.loadingMore} onClick={props.onLoadMore}>
              {props.loadingMore ? 'Loading more...' : 'Load more'}
            </Button>
          ) : <span className="text-xs text-muted-foreground">Showing first results. Refine the search to narrow it down.</span>}
        </div>
      ) : null}
    </div>
  );
}

function HistorySearchResultRow(props: {
  query: string;
  expanded: boolean;
  inlineImageRendering?: InlineImageRenderingMode;
  mode: MessageDisplayMode;
  result: BufferHistorySearchResult;
  resultMeta?: ReactNode;
  onOpenChannel: (channel: string) => void;
  onToggle: () => void;
}) {
  return (
    <div className="rounded-sm border border-transparent">
      <button
        type="button"
        className={cn(
          'flex w-full items-start gap-3 rounded-sm px-2 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/60',
          props.expanded ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/70',
        )}
        aria-expanded={props.expanded}
        onClick={props.onToggle}
      >
        <MessageTimestamp message={props.result.message} />
        <MessageSummary
        query={props.query}
          meta={props.resultMeta}
          inlineImageRendering={props.inlineImageRendering}
          message={props.result.message}
          mode={props.mode}
          onOpenChannel={props.onOpenChannel}
        />
      </button>
      {props.expanded ? (
        <div className="mx-2 mb-2 rounded-sm border border-border bg-background/55 px-2 py-1.5">
          {props.result.context.map((message) => (
            <HistorySearchContextLine
              query={props.query}
              key={message.id}
              active={message.id === props.result.message.id}
              inlineImageRendering={props.inlineImageRendering}
              message={message}
              mode={props.mode}
              onOpenChannel={props.onOpenChannel}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function HistorySearchContextLine(props: {
  query: string;
  active: boolean;
  inlineImageRendering?: InlineImageRenderingMode;
  message: ChatMessage;
  mode: MessageDisplayMode;
  onOpenChannel: (channel: string) => void;
}) {
  return (
    <div
      className={cn(
        'grid grid-cols-[max-content_minmax(0,1fr)] gap-2 rounded-sm px-1 py-1 text-[12px]',
        props.active && 'bg-primary/10',
        messageTone(props.message),
      )}
      data-active={props.active ? 'true' : undefined}
    >
      <MessageTimestamp message={props.message} />
      <MessageSummary
        query={props.query}
        message={props.message}
        inlineImageRendering={props.inlineImageRendering}
        mode={props.mode}
        onOpenChannel={props.onOpenChannel}
      />
    </div>
  );
}

function MessageSummary(props: {
  query: string;
  meta?: ReactNode;
  inlineImageRendering?: InlineImageRenderingMode;
  message: ChatMessage;
  mode: MessageDisplayMode;
  onOpenChannel: (channel: string) => void;
}) {
  const speaker = props.message.speakerNick ?? props.message.nick;
  return (
    <div className="min-w-0 break-words leading-5">
      {props.meta ? (
        <div className="mb-1 flex min-w-0 flex-wrap items-center gap-1.5">
          {props.meta}
        </div>
      ) : null}
      {speaker ? <><span className="mr-2 font-medium text-muted-foreground">{highlightSearchText(speaker, props.query)}</span>{' '}</> : null}
      <span className="text-foreground">
        <FormattedMessageText
          highlightQuery={props.query}
          text={props.message.body}
          inlineImageRendering={resolveMessageInlineImageRendering(
            props.message,
            props.inlineImageRendering,
          )}
          mode={props.mode}
          renderInlinePreviews={false}
          onOpenChannel={props.onOpenChannel}
        />
      </span>
    </div>
  );
}

function MessageTimestamp(props: { message: ChatMessage }) {
  return (
    <time
      className="w-24 shrink-0 font-sans tabular-nums text-xs leading-5 text-muted-foreground"
      dateTime={formatMessageTimestampDateTime(props.message.ts)}
      title={formatMessageTimestampTitle(props.message.ts)}
    >
      <span className="block">{searchDateFormatter.format(props.message.ts)}</span>
      <span className="block">{searchTimeFormatter.format(props.message.ts)}</span>
    </time>
  );
}

function EmptySearchState(props: { children: ReactNode }) {
  return (
    <div className="p-2">
      <div className="rounded-sm border border-dashed border-border px-3 py-6 text-center text-[13px] text-muted-foreground">
        {props.children}
      </div>
    </div>
  );
}

const searchDateFormatter = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const searchTimeFormatter = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
