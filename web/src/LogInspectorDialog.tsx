import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import type {
  ChatMessage,
  LogSource,
  LogSourceListFilters,
  LogSourceListPayload,
  MutedNickState,
  NetworkProfile,
  NickEmojiState,
} from '../../shared/protocol-chat.js';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog.js';
import type { HistorySearchState } from './HistorySearchDialog.js';
import type { BufferHistoryPayload } from './client.js';
import {
  allNetworksValue,
  allSourceKindsValue,
  LogInspectorDialogBody,
  type LogInspectorMode,
  type LogSourceHistoryState,
  type LogSourceListState,
} from './LogInspectorDialogBody.js';
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
  mutedNicks: MutedNickState[];
  nickEmojis: NickEmojiState[];
  onListLogSources: ListLogSources;
  onLoadHistory: LoadSourceHistory;
  onOpenChange: (open: boolean) => void;
  onSearch: SearchLogs;
};

type ListLogSources = (
  filters?: LogSourceListFilters,
  init?: Pick<RequestInit, 'signal'>,
) => Promise<LogSourceListPayload>;

type LoadSourceHistory = (
  bufferId: string,
  beforeMessageId?: string,
  init?: Pick<RequestInit, 'signal'>,
) => Promise<BufferHistoryPayload>;

const initialSearchState: HistorySearchState = {
  status: 'idle',
  query: '',
  results: [],
  hasMore: false,
  error: null,
};

const initialSourceState: LogSourceListState = {
  status: 'idle',
  query: '',
  sources: [],
  error: null,
};

const initialSourceHistoryState: LogSourceHistoryState = {
  status: 'idle',
  messages: [],
  hasMore: false,
  error: null,
};

export function LogInspectorDialog(props: LogInspectorDialogProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const requestAbortRef = useRef<AbortController | null>(null);
  const requestRef = useRef(0);
  const sourceAbortRef = useRef<AbortController | null>(null);
  const sourceRequestRef = useRef(0);
  const sourceHistoryAbortRef = useRef<AbortController | null>(null);
  const sourceHistoryRequestRef = useRef(0);
  const [activeMode, setActiveMode] = useState<LogInspectorMode>('sources');
  const [query, setQuery] = useState('');
  const [networkValue, setNetworkValue] = useState(allNetworksValue);
  const [target, setTarget] = useState('');
  const [expandedMessageId, setExpandedMessageId] = useState<string | null>(null);
  const [searchState, setSearchState] = useState<HistorySearchState>(initialSearchState);
  const [sourceQuery, setSourceQuery] = useState('');
  const [sourceKindValue, setSourceKindValue] = useState(allSourceKindsValue);
  const [sourceState, setSourceState] = useState<LogSourceListState>(initialSourceState);
  const [selectedSource, setSelectedSource] = useState<LogSource | null>(null);
  const [sourceHistoryState, setSourceHistoryState] =
    useState<LogSourceHistoryState>(initialSourceHistoryState);
  const [loadingOlderSourceHistory, setLoadingOlderSourceHistory] = useState(false);

  useEffect(() => {
    requestRef.current += 1;
    requestAbortRef.current?.abort();
    requestAbortRef.current = null;
    sourceRequestRef.current += 1;
    sourceAbortRef.current?.abort();
    sourceAbortRef.current = null;
    sourceHistoryRequestRef.current += 1;
    sourceHistoryAbortRef.current?.abort();
    sourceHistoryAbortRef.current = null;
    setActiveMode('sources');
    setQuery('');
    setNetworkValue(allNetworksValue);
    setTarget('');
    setExpandedMessageId(null);
    setSearchState(initialSearchState);
    setSourceQuery('');
    setSourceKindValue(allSourceKindsValue);
    setSourceState(initialSourceState);
    setSelectedSource(null);
    setSourceHistoryState(initialSourceHistoryState);
    setLoadingOlderSourceHistory(false);
    const cancelFocus = props.open
      ? scheduleAnimationFrameFocus(window, inputRef)
      : undefined;
    if (props.open) {
      void loadSources({
        kindValue: allSourceKindsValue,
        network: allNetworksValue,
        queryText: '',
      });
    }
    return () => {
      requestRef.current += 1;
      requestAbortRef.current?.abort();
      requestAbortRef.current = null;
      sourceRequestRef.current += 1;
      sourceAbortRef.current?.abort();
      sourceAbortRef.current = null;
      sourceHistoryRequestRef.current += 1;
      sourceHistoryAbortRef.current?.abort();
      sourceHistoryAbortRef.current = null;
      cancelFocus?.();
    };
    // Reset everything only when the dialog opens/closes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.open]);

  const loadSources = async ({
    kindValue = sourceKindValue,
    network = networkValue,
    queryText = sourceQuery,
  }: {
    kindValue?: string;
    network?: string;
    queryText?: string;
  } = {}) => {
    const trimmedQuery = queryText.trim();
    const requestId = sourceRequestRef.current + 1;
    sourceRequestRef.current = requestId;
    sourceAbortRef.current?.abort();
    const controller = new AbortController();
    sourceAbortRef.current = controller;
    sourceHistoryRequestRef.current += 1;
    sourceHistoryAbortRef.current?.abort();
    sourceHistoryAbortRef.current = null;
    setSelectedSource(null);
    setSourceHistoryState(initialSourceHistoryState);
    setSourceState({
      status: 'loading',
      query: trimmedQuery,
      sources: [],
      error: null,
    });
    try {
      const payload = await props.onListLogSources({
        kind: kindValue === allSourceKindsValue ? null : kindValue as LogSourceListFilters['kind'],
        networkId: network === allNetworksValue ? null : network,
        q: trimmedQuery || null,
      }, { signal: controller.signal });
      if (sourceRequestRef.current !== requestId || sourceAbortRef.current !== controller) {
        return;
      }
      setSourceState({
        status: 'loaded',
        query: payload.q ?? trimmedQuery,
        sources: payload.sources,
        error: null,
      });
    } catch (error) {
      if (sourceRequestRef.current !== requestId || sourceAbortRef.current !== controller) {
        return;
      }
      setSourceState({
        status: 'error',
        query: trimmedQuery,
        sources: [],
        error: error instanceof Error ? error.message : 'Failed to load sources',
      });
    } finally {
      if (sourceAbortRef.current === controller) {
        sourceAbortRef.current = null;
      }
    }
  };

  const loadSourceHistory = async (source: LogSource, beforeMessageId?: string) => {
    const requestId = sourceHistoryRequestRef.current + 1;
    sourceHistoryRequestRef.current = requestId;
    sourceHistoryAbortRef.current?.abort();
    const controller = new AbortController();
    sourceHistoryAbortRef.current = controller;
    if (beforeMessageId) {
      setLoadingOlderSourceHistory(true);
    } else {
      setSourceHistoryState({
        status: 'loading',
        messages: [],
        hasMore: false,
        error: null,
      });
    }
    try {
      const payload = await props.onLoadHistory(source.buffer.id, beforeMessageId, {
        signal: controller.signal,
      });
      if (
        sourceHistoryRequestRef.current !== requestId
        || sourceHistoryAbortRef.current !== controller
      ) {
        return;
      }
      setSourceHistoryState((current) => ({
        status: 'loaded',
        messages: beforeMessageId
          ? mergeOlderMessages(payload.messages, current.messages)
          : payload.messages,
        hasMore: payload.hasMore,
        error: null,
      }));
    } catch (error) {
      if (
        sourceHistoryRequestRef.current !== requestId
        || sourceHistoryAbortRef.current !== controller
      ) {
        return;
      }
      setSourceHistoryState((current) => ({
        status: 'error',
        messages: beforeMessageId ? current.messages : [],
        hasMore: false,
        error: error instanceof Error ? error.message : 'Failed to load transcript',
      }));
    } finally {
      if (sourceHistoryAbortRef.current === controller) {
        sourceHistoryAbortRef.current = null;
      }
      setLoadingOlderSourceHistory(false);
    }
  };

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

  const handleSourceSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void loadSources();
  };

  const handleActiveModeChange = (value: LogInspectorMode) => {
    setActiveMode(value);
    if (value === 'sources') {
      void loadSources();
    }
  };

  const handleNetworkChange = (value: string) => {
    setNetworkValue(value);
    if (activeMode === 'sources') {
      void loadSources({ network: value });
    }
  };

  const handleSourceKindChange = (value: string) => {
    setSourceKindValue(value);
    void loadSources({ kindValue: value });
  };

  const handleSourceSelect = (source: LogSource) => {
    setSelectedSource(source);
    void loadSourceHistory(source);
  };

  const handleSourceLoadOlder = () => {
    if (
      !selectedSource
      || loadingOlderSourceHistory
      || sourceHistoryState.status !== 'loaded'
      || !sourceHistoryState.hasMore
    ) {
      return;
    }
    const beforeMessageId = sourceHistoryState.messages[0]?.id;
    if (!beforeMessageId) {
      return;
    }
    void loadSourceHistory(selectedSource, beforeMessageId);
  };

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="h-[min(86dvh,46rem)] max-h-[86dvh] gap-0 overflow-hidden p-0 sm:w-[min(calc(100vw-1rem),58rem)]">
        <LogInspectorDialogBody
          activeMode={activeMode}
          expandedMessageId={expandedMessageId}
          inputRef={inputRef}
          loadingOlderSourceHistory={loadingOlderSourceHistory}
          mutedNicks={props.mutedNicks}
          networkValue={networkValue}
          networks={props.networks}
          nickEmojis={props.nickEmojis}
          query={query}
          searchState={searchState}
          selectedSource={selectedSource}
          sourceHistoryState={sourceHistoryState}
          sourceKindValue={sourceKindValue}
          sourceQuery={sourceQuery}
          sourceState={sourceState}
          target={target}
          onActiveModeChange={handleActiveModeChange}
          onNetworkChange={handleNetworkChange}
          onQueryChange={setQuery}
          onResultToggle={(messageId) =>
            setExpandedMessageId((current) => (current === messageId ? null : messageId))}
          onSourceKindChange={handleSourceKindChange}
          onSourceLoadOlder={handleSourceLoadOlder}
          onSourceQueryChange={setSourceQuery}
          onSourceSelect={handleSourceSelect}
          onSourceSubmit={handleSourceSubmit}
          onSubmit={handleSubmit}
          onTargetChange={setTarget}
        />
      </DialogContent>
    </Dialog>
  );
}

const mergeOlderMessages = (
  older: ChatMessage[],
  current: ChatMessage[],
) => {
  const seen = new Set(older.map((message) => message.id));
  return [
    ...older,
    ...current.filter((message) => !seen.has(message.id)),
  ];
};
