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
import { api, type BufferHistoryPayload } from './client.js';
import {
  allNetworksValue,
  allSourceKindsValue,
  LogInspectorDialogBody,
  type LogInspectorMode,
  type LogSourceHistoryState,
  type LogSourceListState,
} from './LogInspectorDialogBody.js';
import { scheduleAnimationFrameFocus } from './animation-frame-focus.js';
import type { SearchLogs } from './history-search-request.js';
import { useLogHistorySearch } from './useLogHistorySearch.js';

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
  const search = useLogHistorySearch(props.open, props.onSearch);
  const sourceAbortRef = useRef<AbortController | null>(null);
  const sourceRequestRef = useRef(0);
  const sourceHistoryAbortRef = useRef<AbortController | null>(null);
  const sourceHistoryRequestRef = useRef(0);
  const [activeMode, setActiveMode] = useState<LogInspectorMode>('sources');
  const [networkValue, setNetworkValue] = useState(allNetworksValue);
  const [expandedMessageId, setExpandedMessageId] = useState<string | null>(null);
  const [scopeLabel, setScopeLabel] = useState('');
  const [sourceQuery, setSourceQuery] = useState('');
  const [sourceKindValue, setSourceKindValue] = useState(allSourceKindsValue);
  const [sourceState, setSourceState] = useState<LogSourceListState>(initialSourceState);
  const [selectedSource, setSelectedSource] = useState<LogSource | null>(null);
  const [sourceHistoryState, setSourceHistoryState] =
    useState<LogSourceHistoryState>(initialSourceHistoryState);
  const [loadingOlderSourceHistory, setLoadingOlderSourceHistory] = useState(false);

  useEffect(() => {
    sourceRequestRef.current += 1;
    sourceAbortRef.current?.abort();
    sourceAbortRef.current = null;
    sourceHistoryRequestRef.current += 1;
    sourceHistoryAbortRef.current?.abort();
    sourceHistoryAbortRef.current = null;
    setActiveMode('sources');
    setNetworkValue(allNetworksValue);
    setExpandedMessageId(null);
    setSourceQuery('');
    setScopeLabel('');
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

  const loadSourceHistory = async (source: LogSource, beforeMessageId?: string, aroundMessageId?: string, newer = false) => {
    const requestId = sourceHistoryRequestRef.current + 1;
    sourceHistoryRequestRef.current = requestId;
    sourceHistoryAbortRef.current?.abort();
    const controller = new AbortController();
    sourceHistoryAbortRef.current = controller;
    if (beforeMessageId || newer) {
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
      const window = aroundMessageId ? await api.loadMessageHistoryWindow(source.buffer.id, aroundMessageId, { signal: controller.signal }) : null;
      const payload = window ? { messages: window.messages, hasMore: window.hasOlder } : await props.onLoadHistory(source.buffer.id, beforeMessageId, { signal: controller.signal });
      if (
        sourceHistoryRequestRef.current !== requestId
        || sourceHistoryAbortRef.current !== controller
      ) {
        return;
      }
      setSourceHistoryState((current) => ({
        status: 'loaded',
        messages: newer ? mergeOlderMessages(current.messages, payload.messages) : beforeMessageId
          ? mergeOlderMessages(payload.messages, current.messages)
          : payload.messages,
        hasMore: newer ? current.hasMore : payload.hasMore,
        hasNewer: beforeMessageId ? current.hasNewer : window?.hasNewer ?? false,
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
        status: beforeMessageId || newer ? 'loaded' : 'error',
        messages: beforeMessageId || newer ? current.messages : [],
        hasMore: current.hasMore,
        hasNewer: current.hasNewer,
        error: error instanceof Error ? error.message : 'Failed to load transcript',
      }));
    } finally {
      if (sourceHistoryAbortRef.current === controller) {
        sourceHistoryAbortRef.current = null;
      }
      if (sourceHistoryRequestRef.current === requestId) setLoadingOlderSourceHistory(false);
    }
  };

  const handleSourceSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void loadSources();
  };

  const handleActiveModeChange = (value: LogInspectorMode) => {
    setActiveMode(value);

  };

  const handleNetworkChange = (value: string) => {
    setNetworkValue(value);
    void loadSources({ network: value });
  };

  const handleSourceKindChange = (value: string) => {
    setSourceKindValue(value);
    void loadSources({ kindValue: value });
  };

  const handleSourceSelect = (source: LogSource) => {
    setSelectedSource(source);
    setExpandedMessageId(null);
    search.setBufferId(source.buffer.id);
    setScopeLabel(source.buffer.target);
    search.setNetworkValue(source.buffer.networkId);
    handleNetworkChange(source.buffer.networkId);
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

  const searchConversation = () => {
    if (!selectedSource) return;
    search.setBufferId(selectedSource.buffer.id);
    setScopeLabel(selectedSource.buffer.target);
    search.setNetworkValue(selectedSource.buffer.networkId);
    handleNetworkChange(selectedSource.buffer.networkId);
    setActiveMode('search');
    inputRef.current?.focus();
  };
  const selectResult = (id: string) => {
    const message = search.state.results.find((result) => result.message.id === id)?.message;
    if (!message) return;
    const source = sourceState.sources.find((item) => item.buffer.id === message.bufferId) ?? {
      buffer: { id: message.bufferId, networkId: message.networkId, target: message.target, kind: message.target.startsWith('#') ? 'channel' : 'query', unread: 0, priorityUnread: 0, lastReadTs: null, lastReadMessageId: null },
      aliases: [], open: false, messageCount: 0, firstMessageTs: message.ts, lastMessageTs: message.ts,
    } as LogSource;
    setSelectedSource(source);
    setExpandedMessageId(id);
    void loadSourceHistory(source, undefined, id);
  };

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent onOpenAutoFocus={(event) => { event.preventDefault(); inputRef.current?.focus(); }} className="h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-none gap-0 overflow-hidden p-0 md:h-[calc(100dvh-2rem)] md:w-[calc(100vw-2rem)] xl:p-0">
        <LogInspectorDialogBody
          scopeBufferId={search.bufferId}
          scopeLabel={scopeLabel}
          searchDirty={search.dirty}
          onScopeChange={(value) => { if (value === 'all') { search.setBufferId(''); search.setNetworkValue(allNetworksValue); handleNetworkChange(allNetworksValue); } else searchConversation(); }}
          onClearFilters={() => { search.setQuery(''); search.setFromDate(''); search.setToDate(''); search.setBufferId(''); search.setNetworkValue(allNetworksValue); handleNetworkChange(allNetworksValue); }}
          onSearchConversation={searchConversation}
          onSourceLatest={() => { if (selectedSource) { setExpandedMessageId(null); void loadSourceHistory(selectedSource); } }}
          onSourceLoadNewer={() => { const last = sourceHistoryState.messages.at(-1); if (selectedSource && last && !loadingOlderSourceHistory) void loadSourceHistory(selectedSource, undefined, last.id, true); }}
          activeMode={activeMode}
          expandedMessageId={expandedMessageId}
          inputRef={inputRef}
          loadingOlderSourceHistory={loadingOlderSourceHistory}
          mutedNicks={props.mutedNicks}
          networks={props.networks}
          nickEmojis={props.nickEmojis}
          query={search.query}
          searchState={search.state}
          selectedSource={selectedSource}
          sourceHistoryState={sourceHistoryState}
          sourceKindValue={sourceKindValue}
          sourceQuery={sourceQuery}
          sourceState={sourceState}
          onActiveModeChange={handleActiveModeChange}
          onNetworkChange={handleNetworkChange}
          onQueryChange={search.setQuery}
          onResultToggle={selectResult}
          onSourceKindChange={handleSourceKindChange}
          onSourceLoadOlder={handleSourceLoadOlder}
          onSourceQueryChange={setSourceQuery}
          onSourceSelect={handleSourceSelect}
          onSourceSubmit={handleSourceSubmit}
          onSubmit={(event) => { setActiveMode('search'); search.submit(event); }}
          searchNetworkValue={search.networkValue}
          onSearchNetworkChange={search.setNetworkValue}
          fromDate={search.fromDate}
          toDate={search.toDate}
          onFromDateChange={search.setFromDate}
          onToDateChange={search.setToDate}
          loadingMore={search.loadingMore}
          pageError={search.pageError}
          onLoadMore={search.loadMore}
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
