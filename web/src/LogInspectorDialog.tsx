import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import type { NetworkProfile } from '../../shared/protocol-chat.js';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog.js';
import type { HistorySearchState } from './HistorySearchDialog.js';
import { allNetworksValue, LogInspectorDialogBody } from './LogInspectorDialogBody.js';
import { scheduleAnimationFrameFocus } from './animation-frame-focus.js';
import {
  runLogSearchRequest,
  type SearchLogs,
} from './history-search-request.js';

export { LogInspectorDialogBody } from './LogInspectorDialogBody.js';
export type { LogInspectorDialogBodyProps } from './LogInspectorDialogBody.js';

type LogInspectorDialogProps = {
  open: boolean;
  networks: NetworkProfile[];
  onOpenChange: (open: boolean) => void;
  onSearch: SearchLogs;
};

const initialSearchState: HistorySearchState = {
  status: 'idle',
  query: '',
  results: [],
  hasMore: false,
  error: null,
};

export function LogInspectorDialog(props: LogInspectorDialogProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const requestAbortRef = useRef<AbortController | null>(null);
  const requestRef = useRef(0);
  const [query, setQuery] = useState('');
  const [networkValue, setNetworkValue] = useState(allNetworksValue);
  const [target, setTarget] = useState('');
  const [expandedMessageId, setExpandedMessageId] = useState<string | null>(null);
  const [searchState, setSearchState] = useState<HistorySearchState>(initialSearchState);

  useEffect(() => {
    requestRef.current += 1;
    requestAbortRef.current?.abort();
    requestAbortRef.current = null;
    setQuery('');
    setNetworkValue(allNetworksValue);
    setTarget('');
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
  }, [props.open]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
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
    await runLogSearchRequest({
      filters: {
        networkId: networkValue === allNetworksValue ? null : networkValue,
        target: target.trim() || null,
      },
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

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="h-[min(86dvh,46rem)] max-h-[86dvh] gap-0 overflow-hidden p-0 sm:w-[min(calc(100vw-1rem),58rem)]">
        <LogInspectorDialogBody
          expandedMessageId={expandedMessageId}
          inputRef={inputRef}
          networkValue={networkValue}
          networks={props.networks}
          query={query}
          searchState={searchState}
          target={target}
          onNetworkChange={setNetworkValue}
          onQueryChange={setQuery}
          onResultToggle={(messageId) =>
            setExpandedMessageId((current) => (current === messageId ? null : messageId))}
          onSubmit={handleSubmit}
          onTargetChange={setTarget}
        />
      </DialogContent>
    </Dialog>
  );
}
