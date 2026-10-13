import { useMemo, useState, type FormEvent, type RefObject } from 'react';
import { Search, X } from 'lucide-react';
import type { ChatMessage, LogSource, MutedNickState, NetworkProfile, NickEmojiState } from '../../shared/protocol-chat.js';
import { Button } from '@/components/ui/button.js';
import { DialogClose, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog.js';
import { Input } from '@/components/ui/input.js';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs.js';
import type { HistorySearchState } from './HistorySearchDialog.js';
import { SourceList } from './HistoryConversationList.js';
import { HistoryWorkspaceResults } from './HistoryWorkspaceResults.js';
import { HistoryTranscriptPane } from './HistoryTranscriptPane.js';
import { cn } from '@/lib/utils.js';

export const allNetworksValue = '__all__';
export const allSourceKindsValue = '__all_source_kinds__';

export type LogInspectorMode = 'sources' | 'search';

export type LogSourceListState = {
  status: 'idle' | 'loading' | 'loaded' | 'error';
  query: string;
  sources: LogSource[];
  error: string | null;
};

export type LogSourceHistoryState = {
  status: 'idle' | 'loading' | 'loaded' | 'error';
  messages: ChatMessage[];
  hasMore: boolean;
  hasNewer?: boolean;
  error: string | null;
};

export type LogInspectorDialogBodyProps = {
  scopeBufferId: string;
  scopeLabel: string;
  searchDirty: boolean;
  onScopeChange: (value: string) => void;
  onClearFilters: () => void;
  onSearchConversation: () => void;
  onSourceLoadNewer: () => void;
  onSourceLatest: () => void;
  fromDate: string;
  toDate: string;
  searchNetworkValue: string;
  loadingMore: boolean;
  pageError: string | null;
  onFromDateChange: (value: string) => void;
  onToDateChange: (value: string) => void;
  onSearchNetworkChange: (value: string) => void;
  onLoadMore: () => void;
  activeMode: LogInspectorMode;
  expandedMessageId: string | null;
  inputRef: RefObject<HTMLInputElement | null>;
  loadingOlderSourceHistory: boolean;
  mutedNicks: MutedNickState[];
  networks: NetworkProfile[];
  nickEmojis: NickEmojiState[];
  query: string;
  searchState: HistorySearchState;
  selectedSource: LogSource | null;
  sourceHistoryState: LogSourceHistoryState;
  sourceKindValue: string;
  sourceQuery: string;
  sourceState: LogSourceListState;
  onActiveModeChange: (value: LogInspectorMode) => void;
  onNetworkChange: (value: string) => void;
  onQueryChange: (value: string) => void;
  onResultToggle: (messageId: string) => void;
  onSourceKindChange: (value: string) => void;
  onSourceLoadOlder: () => void;
  onSourceQueryChange: (value: string) => void;
  onSourceSelect: (source: LogSource) => void;
  onSourceSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

export function LogInspectorDialogBody(props: LogInspectorDialogBodyProps) {
  const [showReader, setShowReader] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const names = useMemo(() => new Map(props.networks.map((network) => [network.id, network.name])), [props.networks]);
  const invalidDates = !!props.fromDate && !!props.toDate && props.fromDate > props.toDate;
  return <div className="flex h-full min-h-0 flex-col">
    <DialogHeader className="relative shrink-0 border-b border-border px-5 py-3 pr-14">
      <DialogClose asChild><Button variant="ghost" size="icon" className="absolute right-3 top-3" aria-label="Close chat history"><X /></Button></DialogClose>
      <DialogTitle>Chat history</DialogTitle>
      <DialogDescription>Browse and search saved conversations</DialogDescription>
    </DialogHeader>
    <form onSubmit={(event) => { setShowReader(false); props.onSubmit(event); }} className="shrink-0 space-y-2 border-b border-border px-4 py-3">
      <div className="flex flex-wrap gap-2">
        <Input ref={props.inputRef} value={props.query} onChange={(event) => props.onQueryChange(event.currentTarget.value)} placeholder="Search messages or browse by date" aria-label="Search chat history" className="min-w-0 flex-1" />
        <div className={cn(showFilters ? 'contents' : 'hidden md:contents')}>
        <select aria-label="Search scope" value={props.scopeBufferId ? 'conversation' : 'all'} className={selectClass} onChange={(event) => props.onScopeChange(event.target.value)}>
          <option value="all">All conversations</option>
          <option value="conversation" disabled={!props.selectedSource && !props.scopeBufferId}>This conversation{props.scopeLabel ? ` · ${props.scopeLabel}` : ''}</option>
        </select>
        <select aria-label="Filter logs by network" value={props.searchNetworkValue} className={selectClass} disabled={!!props.scopeBufferId} onChange={(event) => { props.onSearchNetworkChange(event.target.value); props.onNetworkChange(event.target.value); }}>
          <option value={allNetworksValue}>All networks</option>
          {props.networks.map((network) => <option key={network.id} value={network.id}>{network.name}</option>)}
        </select>
        </div>
        <Button type="submit" disabled={invalidDates || props.searchState.status === 'loading'}><Search />Search</Button>
      </div>
      <Button type="button" variant="ghost" size="sm" className="md:hidden" aria-expanded={showFilters} onClick={() => setShowFilters((value) => !value)}>{showFilters ? 'Hide filters' : 'Filters'} · {props.scopeBufferId ? props.scopeLabel : 'All conversations'}</Button>
      <div className={cn('flex-wrap items-center gap-x-4 gap-y-2', showFilters ? 'flex' : 'hidden md:flex')}>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">From<Input type="date" aria-label="From date" className="h-8 w-36" value={props.fromDate} max={props.toDate || undefined} onChange={(event) => props.onFromDateChange(event.target.value)} /></label>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">To<Input type="date" aria-label="To date" className="h-8 w-36" value={props.toDate} min={props.fromDate || undefined} onChange={(event) => props.onToDateChange(event.target.value)} /></label>
        <Button type="button" variant="ghost" size="sm" onClick={props.onClearFilters}>Clear filters</Button>
        {invalidDates ? <p role="alert" className="text-xs text-destructive">Choose an end date on or after the start date.</p> : null}
      </div>
    </form>
    <div className="grid min-h-0 flex-1 md:grid-cols-[minmax(17rem,24rem)_minmax(0,1fr)]">
      <Tabs value={props.activeMode} onValueChange={(value) => props.onActiveModeChange(value as LogInspectorMode)} className={cn('flex min-h-0 flex-col border-r border-border bg-black/10', showReader && 'hidden md:flex')}>
        <TabsList className="m-2 shrink-0 self-start">
          <TabsTrigger value="sources">Conversations</TabsTrigger>
          <TabsTrigger value="search">Results{props.searchState.status === 'loaded' && !props.searchDirty ? ` (${props.searchState.results.length})` : ''}</TabsTrigger>
        </TabsList>
        <TabsContent forceMount value="sources" className="m-0 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden">
          <form onSubmit={props.onSourceSubmit} className="space-y-2 border-b border-border p-3">
            <div className="flex gap-2"><Input value={props.sourceQuery} onChange={(event) => props.onSourceQueryChange(event.target.value)} placeholder="Find a conversation" aria-label="Find conversation" /><Button type="submit" variant="outline" disabled={props.sourceState.status === 'loading'}>Find</Button></div>
            <select aria-label="Filter conversations by type" value={props.sourceKindValue} className={cn(selectClass, 'w-full')} onChange={(event) => props.onSourceKindChange(event.target.value)}>
              <option value={allSourceKindsValue}>All types</option><option value="channel">Channels</option><option value="query">Direct messages</option>
            </select>
          </form>
          <div className="min-h-0 flex-1 overflow-y-auto"><SourceList networkNamesById={names} selectedSource={props.selectedSource} sourceState={props.sourceState} onSourceSelect={(source) => { props.onSourceSelect(source); setShowReader(true); }} /></div>
        </TabsContent>
        <TabsContent forceMount value="search" className="m-0 min-h-0 flex-1 overflow-y-auto data-[state=inactive]:hidden">
          <HistoryWorkspaceResults state={props.searchState} dirty={props.searchDirty} names={names} selectedId={props.expandedMessageId} loadingMore={props.loadingMore} pageError={props.pageError} onLoadMore={props.onLoadMore} onSelect={(id) => { props.onResultToggle(id); setShowReader(true); }} />
        </TabsContent>
      </Tabs>
      <section aria-label="Conversation history" className={cn('flex min-h-0 min-w-0 flex-col', !showReader && 'hidden md:flex')}>
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div className="min-w-0"><Button variant="ghost" size="sm" className="mb-1 md:hidden" onClick={() => setShowReader(false)}>Back to list</Button><h3 className="truncate text-base font-semibold">{props.selectedSource?.buffer.target ?? 'Conversation history'}</h3><p className="text-xs text-muted-foreground">{props.selectedSource ? `${names.get(props.selectedSource.buffer.networkId) ?? props.selectedSource.buffer.networkId} · Saved messages` : 'Select a conversation or search result'}</p></div>
          {props.selectedSource ? <div className="flex flex-wrap gap-1"><Button variant="ghost" size="sm" onClick={() => { props.onSearchConversation(); setShowReader(false); }}>Search this conversation</Button><Button variant="outline" size="sm" onClick={props.onSourceLatest}>Latest messages</Button></div> : null}
        </div>
        <HistoryTranscriptPane state={props.sourceHistoryState} selectedId={props.expandedMessageId} bufferId={props.selectedSource?.buffer.id ?? null} mutedNicks={props.mutedNicks} nickEmojis={props.nickEmojis} loading={props.loadingOlderSourceHistory} onLoadOlder={props.onSourceLoadOlder} onLoadNewer={props.onSourceLoadNewer} />
      </section>
    </div>
  </div>;
}

const selectClass = 'h-9 min-w-0 max-w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50';
