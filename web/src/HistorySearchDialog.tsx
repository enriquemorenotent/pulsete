import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type RefObject,
} from 'react';
import { Search } from 'lucide-react';
import type { BufferHistorySearchResult, BufferState } from '../../shared/protocol-chat.js';
import { Button } from '@/components/ui/button.js';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog.js';
import { Input } from '@/components/ui/input.js';
import { ScrollArea } from '@/components/ui/scroll-area.js';
import { HistorySearchResults } from './HistorySearchDialogResults.js';
import { scheduleAnimationFrameFocus } from './animation-frame-focus.js';
import { runHistorySearchRequest, type SearchBufferHistory } from './history-search-request.js';
import type { MessageDisplayMode } from './message-display-mode.js';

type HistorySearchDialogProps = {
  open: boolean;
  buffer: BufferState | null;
  mode: MessageDisplayMode;
  onOpenChange: (open: boolean) => void;
  onOpenChannel: (channel: string) => void;
  onSearch?: SearchBufferHistory;
};

export type HistorySearchState = {
  status: 'idle' | 'loading' | 'loaded' | 'error';
  query: string;
  results: BufferHistorySearchResult[];
  hasMore: boolean;
  error: string | null;
};

export type HistorySearchDialogBodyProps = {
  expandedMessageId: string | null;
  inputRef: RefObject<HTMLInputElement | null>;
  mode: MessageDisplayMode;
  query: string;
  searchState: HistorySearchState;
  title: string;
  onOpenChannel: (channel: string) => void;
  onQueryChange: (value: string) => void;
  onResultToggle: (messageId: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

const initialSearchState: HistorySearchState = {
  status: 'idle',
  query: '',
  results: [],
  hasMore: false,
  error: null,
};

export function HistorySearchDialog(props: HistorySearchDialogProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const requestAbortRef = useRef<AbortController | null>(null);
  const requestRef = useRef(0);
  const [query, setQuery] = useState('');
  const [expandedMessageId, setExpandedMessageId] = useState<string | null>(null);
  const [searchState, setSearchState] = useState<HistorySearchState>(initialSearchState);

  useEffect(() => {
    requestRef.current += 1;
    requestAbortRef.current?.abort();
    requestAbortRef.current = null;
    setQuery('');
    setExpandedMessageId(null);
    setSearchState(initialSearchState);
    const cancelFocus = props.open
      ? scheduleAnimationFrameFocus(window, inputRef)
      : undefined;
    return () => {
      requestRef.current += 1;
      requestAbortRef.current?.abort();
      requestAbortRef.current = null;
      cancelFocus?.();
    };
  }, [props.open, props.buffer?.id]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedQuery = query.trim();
    if (!props.buffer || !props.onSearch || !trimmedQuery) {
      requestRef.current += 1;
      requestAbortRef.current?.abort();
      requestAbortRef.current = null;
      setSearchState(initialSearchState);
      return;
    }
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    requestAbortRef.current?.abort();
    const controller = new AbortController();
    requestAbortRef.current = controller;
    setExpandedMessageId(null);
    setSearchState({
      status: 'loading',
      query: trimmedQuery,
      results: [],
      hasMore: false,
      error: null,
    });
    await runHistorySearchRequest({
      bufferId: props.buffer.id,
      query: trimmedQuery,
      signal: controller.signal,
      search: props.onSearch,
      isCurrentRequest: () =>
        requestRef.current === requestId
        && requestAbortRef.current === controller,
      onLoaded: (payload) => {
        setSearchState({
          status: 'loaded',
          query: payload.query,
          results: payload.results,
          hasMore: payload.hasMore,
          error: null,
        });
      },
      onError: (message) => {
        setSearchState({
          status: 'error',
          query: trimmedQuery,
          results: [],
          hasMore: false,
          error: message,
        });
      },
      onSettled: () => {
        if (requestAbortRef.current === controller) {
          requestAbortRef.current = null;
        }
      },
    });
  };

  const title = props.buffer?.target ?? 'History';

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="h-[min(84dvh,40rem)] max-h-[84dvh] gap-0 overflow-hidden p-0 sm:w-[min(calc(100vw-1rem),44rem)]">
        <HistorySearchDialogBody
          expandedMessageId={expandedMessageId}
          inputRef={inputRef}
          mode={props.mode}
          query={query}
          searchState={searchState}
          title={title}
          onOpenChannel={props.onOpenChannel}
          onQueryChange={setQuery}
          onResultToggle={(messageId) =>
            setExpandedMessageId((current) => (current === messageId ? null : messageId))}
          onSubmit={handleSubmit}
        />
      </DialogContent>
    </Dialog>
  );
}

export function HistorySearchDialogBody(props: HistorySearchDialogBodyProps) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <DialogHeader className="shrink-0 border-b border-border px-4 py-3">
        <DialogTitle>Search history</DialogTitle>
        <DialogDescription>{props.title}</DialogDescription>
      </DialogHeader>
      <form onSubmit={props.onSubmit} className="flex shrink-0 gap-2 border-b border-border px-4 py-3">
        <Input
          ref={props.inputRef}
          value={props.query}
          onChange={(event) => props.onQueryChange(event.currentTarget.value)}
          placeholder="Search messages"
          aria-label="Search message history"
        />
        <Button type="submit" disabled={!props.query.trim() || props.searchState.status === 'loading'}>
          <Search />
          Search
        </Button>
      </form>
      <ScrollArea className="min-h-0 flex-1">
        <HistorySearchResults
          expandedMessageId={props.expandedMessageId}
          mode={props.mode}
          searchState={props.searchState}
          onOpenChannel={props.onOpenChannel}
          onResultToggle={props.onResultToggle}
        />
      </ScrollArea>
    </div>
  );
}
