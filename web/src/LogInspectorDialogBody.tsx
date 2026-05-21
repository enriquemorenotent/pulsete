import { useMemo, type FormEvent, type ReactNode, type RefObject } from 'react';
import { Hash, Search, UserRound } from 'lucide-react';
import type {
  ChannelUserMode,
  ChatMessage,
  LogSource,
  MutedNickState,
  NetworkProfile,
  NickEmojiState,
} from '../../shared/protocol-chat.js';
import { Badge } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import {
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog.js';
import { Input } from '@/components/ui/input.js';
import { ScrollArea } from '@/components/ui/scroll-area.js';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select.js';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs.js';
import { ChatTranscriptStatic } from './ChatTranscriptStatic.js';
import { HistorySearchResults } from './HistorySearchDialogResults.js';
import type { HistorySearchState } from './HistorySearchDialog.js';
import { buildNickEmojiByNetworkNick } from './nick-emoji-utils.js';
import { formatMessageTimestampTitle } from './chat-pane-message-utils.js';
import { defaultMessageDisplayMode } from './message-display-mode.js';
import { buildChatTranscriptModel } from './transcript/model.js';
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
  error: string | null;
};

export type LogInspectorDialogBodyProps = {
  activeMode: LogInspectorMode;
  expandedMessageId: string | null;
  inputRef: RefObject<HTMLInputElement | null>;
  loadingOlderSourceHistory: boolean;
  mutedNicks: MutedNickState[];
  networkValue: string;
  networks: NetworkProfile[];
  nickEmojis: NickEmojiState[];
  query: string;
  searchState: HistorySearchState;
  selectedSource: LogSource | null;
  sourceHistoryState: LogSourceHistoryState;
  sourceKindValue: string;
  sourceQuery: string;
  sourceState: LogSourceListState;
  target: string;
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
  onTargetChange: (value: string) => void;
};

export function LogInspectorDialogBody(props: LogInspectorDialogBodyProps) {
  const networkNamesById = useMemo(
    () => new Map(props.networks.map((network) => [network.id, network.name])),
    [props.networks],
  );
  const renderResultMeta = (message: ChatMessage) => (
    <>
      <Badge variant="secondary" className="normal-case tracking-normal">
        {networkNamesById.get(message.networkId) ?? message.networkId}
      </Badge>
      <Badge variant="outline" className="normal-case tracking-normal">
        {message.target}
      </Badge>
    </>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <DialogHeader className="shrink-0 border-b border-border px-4 py-3">
        <DialogTitle>Log inspector</DialogTitle>
        <DialogDescription>All saved logs</DialogDescription>
      </DialogHeader>
      <Tabs
        value={props.activeMode}
        onValueChange={(value) => props.onActiveModeChange(value as LogInspectorMode)}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="shrink-0 border-b border-border px-4 py-2">
          <TabsList>
            <TabsTrigger value="sources">Sources</TabsTrigger>
            <TabsTrigger value="search">Search</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="sources" className="m-0 flex min-h-0 flex-1 flex-col">
          <SourceBrowser
            loadingOlderHistory={props.loadingOlderSourceHistory}
            mutedNicks={props.mutedNicks}
            networkNamesById={networkNamesById}
            networkValue={props.networkValue}
            networks={props.networks}
            nickEmojis={props.nickEmojis}
            selectedSource={props.selectedSource}
            sourceHistoryState={props.sourceHistoryState}
            sourceKindValue={props.sourceKindValue}
            sourceQuery={props.sourceQuery}
            sourceState={props.sourceState}
            onNetworkChange={props.onNetworkChange}
            onSourceKindChange={props.onSourceKindChange}
            onSourceLoadOlder={props.onSourceLoadOlder}
            onSourceQueryChange={props.onSourceQueryChange}
            onSourceSelect={props.onSourceSelect}
            onSourceSubmit={props.onSourceSubmit}
          />
        </TabsContent>
        <TabsContent value="search" className="m-0 flex min-h-0 flex-1 flex-col">
          <form
            onSubmit={props.onSubmit}
            className="flex shrink-0 flex-col gap-2 border-b border-border px-4 py-3 md:flex-row"
          >
            <Input
              ref={props.inputRef}
              value={props.query}
              onChange={(event) => props.onQueryChange(event.currentTarget.value)}
              placeholder="Search all logs"
              aria-label="Search all logs"
              className="md:flex-1"
            />
            <NetworkSelect
              networkValue={props.networkValue}
              networks={props.networks}
              onNetworkChange={props.onNetworkChange}
            />
            <Input
              value={props.target}
              onChange={(event) => props.onTargetChange(event.currentTarget.value)}
              placeholder="Conversation"
              aria-label="Filter logs by conversation"
              className="md:w-44"
            />
            <Button type="submit" disabled={!props.query.trim() || props.searchState.status === 'loading'}>
              <Search />
              Search
            </Button>
          </form>
          <ScrollArea className="min-h-0 flex-1">
            <HistorySearchResults
              expandedMessageId={props.expandedMessageId}
              mode={defaultMessageDisplayMode}
              renderResultMeta={renderResultMeta}
              searchState={props.searchState}
              onOpenChannel={() => undefined}
              onResultToggle={props.onResultToggle}
            />
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SourceBrowser(props: {
  loadingOlderHistory: boolean;
  mutedNicks: MutedNickState[];
  networkNamesById: ReadonlyMap<string, string>;
  networkValue: string;
  networks: NetworkProfile[];
  nickEmojis: NickEmojiState[];
  selectedSource: LogSource | null;
  sourceHistoryState: LogSourceHistoryState;
  sourceKindValue: string;
  sourceQuery: string;
  sourceState: LogSourceListState;
  onNetworkChange: (value: string) => void;
  onSourceKindChange: (value: string) => void;
  onSourceLoadOlder: () => void;
  onSourceQueryChange: (value: string) => void;
  onSourceSelect: (source: LogSource) => void;
  onSourceSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <form
        onSubmit={props.onSourceSubmit}
        className="flex shrink-0 flex-col gap-2 border-b border-border px-4 py-3 md:flex-row"
      >
        <Input
          value={props.sourceQuery}
          onChange={(event) => props.onSourceQueryChange(event.currentTarget.value)}
          placeholder="Channel or PM"
          aria-label="Find log source"
          className="md:flex-1"
        />
        <NetworkSelect
          networkValue={props.networkValue}
          networks={props.networks}
          onNetworkChange={props.onNetworkChange}
        />
        <Select value={props.sourceKindValue} onValueChange={props.onSourceKindChange}>
          <SelectTrigger size="sm" className="w-full md:w-32" aria-label="Filter sources by type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value={allSourceKindsValue}>All sources</SelectItem>
              <SelectItem value="channel">Channels</SelectItem>
              <SelectItem value="query">PMs</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
        <Button type="submit" disabled={props.sourceState.status === 'loading'}>
          <Search />
          Browse
        </Button>
      </form>
      <div className="grid min-h-0 flex-1 md:grid-cols-[20rem_minmax(0,1fr)]">
        <ScrollArea className="min-h-0 border-b border-border md:border-b-0 md:border-r">
          <SourceList
            networkNamesById={props.networkNamesById}
            selectedSource={props.selectedSource}
            sourceState={props.sourceState}
            onSourceSelect={props.onSourceSelect}
          />
        </ScrollArea>
        <SourceTranscript
          historyState={props.sourceHistoryState}
          loadingOlderHistory={props.loadingOlderHistory}
          mutedNicks={props.mutedNicks}
          nickEmojis={props.nickEmojis}
          selectedSource={props.selectedSource}
          onLoadOlder={props.onSourceLoadOlder}
        />
      </div>
    </div>
  );
}

function NetworkSelect(props: {
  networkValue: string;
  networks: NetworkProfile[];
  onNetworkChange: (value: string) => void;
}) {
  return (
    <Select value={props.networkValue} onValueChange={props.onNetworkChange}>
      <SelectTrigger size="sm" className="w-full md:w-44" aria-label="Filter logs by network">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectItem value={allNetworksValue}>All networks</SelectItem>
          {props.networks.map((network) => (
            <SelectItem key={network.id} value={network.id}>
              {network.name}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

function SourceList(props: {
  networkNamesById: ReadonlyMap<string, string>;
  selectedSource: LogSource | null;
  sourceState: LogSourceListState;
  onSourceSelect: (source: LogSource) => void;
}) {
  if (props.sourceState.status === 'idle') {
    return <SourceEmptyState>Browse saved sources.</SourceEmptyState>;
  }
  if (props.sourceState.status === 'loading') {
    return <SourceEmptyState>Loading sources...</SourceEmptyState>;
  }
  if (props.sourceState.status === 'error') {
    return <SourceEmptyState>{props.sourceState.error ?? 'Failed to load sources'}</SourceEmptyState>;
  }
  if (props.sourceState.sources.length === 0) {
    return <SourceEmptyState>No saved sources found.</SourceEmptyState>;
  }
  return (
    <div className="flex flex-col gap-1 p-2">
      {props.sourceState.sources.map((source) => (
        <SourceRow
          key={source.buffer.id}
          networkName={props.networkNamesById.get(source.buffer.networkId) ?? source.buffer.networkId}
          selected={props.selectedSource?.buffer.id === source.buffer.id}
          source={source}
          onSelect={() => props.onSourceSelect(source)}
        />
      ))}
    </div>
  );
}

function SourceRow(props: {
  networkName: string;
  selected: boolean;
  source: LogSource;
  onSelect: () => void;
}) {
  const kindLabel = props.source.buffer.kind === 'channel' ? 'Channel' : 'PM';
  const Icon = props.source.buffer.kind === 'channel' ? Hash : UserRound;
  return (
    <button
      type="button"
      className={cn(
        'w-full rounded-sm px-2 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/60',
        props.selected ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/70',
      )}
      onClick={props.onSelect}
    >
      <div className="flex min-w-0 items-center gap-2">
        <Icon className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 truncate text-sm font-medium">{props.source.buffer.target}</span>
      </div>
      <div className="mt-1 flex flex-wrap gap-1.5">
        <Badge variant="secondary" className="normal-case tracking-normal">{props.networkName}</Badge>
        <Badge variant="outline" className="normal-case tracking-normal">{kindLabel}</Badge>
        {!props.source.open ? (
          <Badge variant="secondary" className="normal-case tracking-normal">Closed</Badge>
        ) : null}
        <Badge variant="secondary" className="normal-case tracking-normal">
          {formatMessageCount(props.source.messageCount)}
        </Badge>
      </div>
      {props.source.aliases.length > 0 ? (
        <div className="mt-1 truncate text-[12px] text-muted-foreground">
          aka {props.source.aliases.join(', ')}
        </div>
      ) : null}
      {props.source.lastMessageTs ? (
        <time className="mt-1 block text-[11px] text-muted-foreground">
          {formatMessageTimestampTitle(props.source.lastMessageTs)}
        </time>
      ) : null}
    </button>
  );
}

function SourceTranscript(props: {
  historyState: LogSourceHistoryState;
  loadingOlderHistory: boolean;
  mutedNicks: MutedNickState[];
  nickEmojis: NickEmojiState[];
  selectedSource: LogSource | null;
  onLoadOlder: () => void;
}) {
  const nickEmojiByNetworkNick = useMemo(
    () => buildNickEmojiByNetworkNick(props.nickEmojis),
    [props.nickEmojis],
  );
  const model = useMemo(
    () => buildChatTranscriptModel({
      firstUnreadDividerIndex: null,
      listKind: 'chat',
      messages: props.historyState.messages,
      mutedNicks: props.mutedNicks,
      unreadDividerKey: `log-source:${props.selectedSource?.buffer.id ?? 'none'}`,
    }),
    [props.historyState.messages, props.mutedNicks, props.selectedSource?.buffer.id],
  );

  if (!props.selectedSource) {
    return <SourceEmptyState>Select a source.</SourceEmptyState>;
  }
  if (props.historyState.status === 'loading') {
    return <SourceEmptyState>Loading transcript...</SourceEmptyState>;
  }
  if (props.historyState.status === 'error') {
    return <SourceEmptyState>{props.historyState.error ?? 'Failed to load transcript'}</SourceEmptyState>;
  }

  return (
    <ChatTranscriptStatic
      channelUserModesByNick={emptyChannelUserModes}
      emptyBody="No saved messages."
      expandedMutedGroupKeys={emptyExpandedMutedGroupKeys}
      listKind="chat"
      loadingOlderHistory={props.loadingOlderHistory}
      mode={defaultMessageDisplayMode}
      model={model}
      nickEmojiByNetworkNick={nickEmojiByNetworkNick}
      onLoadOlderHistory={props.historyState.hasMore ? async () => {
        props.onLoadOlder();
        return 0;
      } : undefined}
      onOpenChannel={() => undefined}
      onToggleMutedGroup={() => undefined}
      participantHighlightMode="none"
    />
  );
}

const emptyChannelUserModes = new Map<string, ChannelUserMode>();
const emptyExpandedMutedGroupKeys = new Set<string>();

const formatMessageCount = (count: number) =>
  count === 1 ? '1 message' : `${count} messages`;

function SourceEmptyState(props: { children: ReactNode }) {
  return (
    <div className="p-2">
      <div className="rounded-sm border border-dashed border-border px-3 py-6 text-center text-[13px] text-muted-foreground">
        {props.children}
      </div>
    </div>
  );
}
