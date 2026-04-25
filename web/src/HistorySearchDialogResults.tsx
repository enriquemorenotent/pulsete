import type {
  BufferHistorySearchResult,
  ChatMessage,
} from '../../shared/protocol.js';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils.js';
import {
  formatMessageTime,
  formatMessageTimestampDateTime,
  formatMessageTimestampTitle,
  messageTone,
} from './chat-pane-message-utils.js';
import { FormattedMessageText } from './FormattedMessageText.js';
import type { HistorySearchState } from './HistorySearchDialog.js';
import type { MessageDisplayMode } from './message-display-mode.js';

export function HistorySearchResults(props: {
  expandedMessageId: string | null;
  mode: MessageDisplayMode;
  searchState: HistorySearchState;
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
    <div className="space-y-1 p-2">
      {searchState.results.map((result) => (
        <HistorySearchResultRow
          key={result.message.id}
          expanded={props.expandedMessageId === result.message.id}
          mode={props.mode}
          result={result}
          onOpenChannel={props.onOpenChannel}
          onToggle={() => props.onResultToggle(result.message.id)}
        />
      ))}
      {searchState.hasMore ? (
        <div className="px-2 py-2 text-[12px] text-muted-foreground">
          Showing first results. Refine the search to narrow it down.
        </div>
      ) : null}
    </div>
  );
}

function HistorySearchResultRow(props: {
  expanded: boolean;
  mode: MessageDisplayMode;
  result: BufferHistorySearchResult;
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
          message={props.result.message}
          mode={props.mode}
          onOpenChannel={props.onOpenChannel}
        />
      </button>
      {props.expanded ? (
        <div className="mx-2 mb-2 rounded-sm border border-border bg-background/55 px-2 py-1.5">
          {props.result.context.map((message) => (
            <HistorySearchContextLine
              key={message.id}
              active={message.id === props.result.message.id}
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
  active: boolean;
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
        message={props.message}
        mode={props.mode}
        onOpenChannel={props.onOpenChannel}
      />
    </div>
  );
}

function MessageSummary(props: {
  message: ChatMessage;
  mode: MessageDisplayMode;
  onOpenChannel: (channel: string) => void;
}) {
  const speaker = props.message.speakerNick ?? props.message.nick;
  return (
    <div className="min-w-0 break-words leading-5">
      {speaker ? <span className="mr-2 font-medium text-muted-foreground">{speaker}</span> : null}
      <span className="text-foreground">
        <FormattedMessageText
          text={props.message.body}
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
      className="shrink-0 font-sans tabular-nums text-[11px] leading-5 text-muted-foreground"
      dateTime={formatMessageTimestampDateTime(props.message.ts)}
      title={formatMessageTimestampTitle(props.message.ts)}
    >
      {formatMessageTime(props.message.ts)}
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
