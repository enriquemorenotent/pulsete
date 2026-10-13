import type { ReactNode } from 'react';
import { Hash, UserRound } from 'lucide-react';
import type { LogSource } from '../../shared/protocol-chat.js';
import type { LogSourceListState } from './LogInspectorDialogBody.js';
import { formatMessageTimestampTitle } from './chat-pane-message-utils.js';
import { cn } from '@/lib/utils.js';
export function SourceList(props: {
  networkNamesById: ReadonlyMap<string, string>;
  selectedSource: LogSource | null;
  sourceState: LogSourceListState;
  onSourceSelect: (source: LogSource) => void;
}) {
  if (props.sourceState.status === 'idle') {
    return <SourceEmptyState>Browse saved conversations.</SourceEmptyState>;
  }
  if (props.sourceState.status === 'loading') {
    return <SourceEmptyState>Loading conversations...</SourceEmptyState>;
  }
  if (props.sourceState.status === 'error') {
    return <SourceEmptyState>{props.sourceState.error ?? 'Failed to load sources'}</SourceEmptyState>;
  }
  if (props.sourceState.sources.length === 0) {
    return <SourceEmptyState>No saved conversations found.</SourceEmptyState>;
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
  const kindLabel = props.source.buffer.kind === 'channel' ? 'Channel' : 'Direct message';
  const Icon = props.source.buffer.kind === 'channel' ? Hash : UserRound;
  return (
    <button
      type="button"
      className={cn(
        'w-full rounded-sm px-2 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/60',
        props.selected ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/70',
      )}
      onClick={props.onSelect}
      aria-pressed={props.selected}
      title={`${props.networkName} · ${kindLabel} · ${formatMessageCount(props.source.messageCount)}`}
    >
      <div className="flex min-w-0 items-center gap-2">
        <Icon className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 truncate text-sm font-medium">{props.source.buffer.target}</span>
      </div>
      <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
        <span className="min-w-0 truncate">{props.networkName}</span>
        {!props.source.open ? <span className="shrink-0">Closed</span> : null}
      </div>
      {props.source.aliases.length > 0 ? (
        <div className="mt-1 truncate text-[12px] text-muted-foreground">
          aka {props.source.aliases.join(', ')}
        </div>
      ) : null}
      {props.source.lastMessageTs ? (
        <time className="mt-1 block text-xs text-muted-foreground" dateTime={new Date(props.source.lastMessageTs).toISOString()} title={formatMessageTimestampTitle(props.source.lastMessageTs)}>
          {lastActivityFormatter.format(props.source.lastMessageTs)}
        </time>
      ) : null}
    </button>
  );
}

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

const lastActivityFormatter = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
