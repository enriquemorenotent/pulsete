import { Hash, Search, Users, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils.js';
import { memo, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Virtuoso } from 'react-virtuoso';
import type { ChannelListEntry, NetworkProfile } from '../../shared/protocol-chat.js';
import type { ChannelListState } from './app-types.js';
import { Button } from '@/components/ui/button.js';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog.js';
import { Input } from '@/components/ui/input.js';

type ChannelListDialogProps = {
  network: NetworkProfile | null;
  state: ChannelListState;
  onClose: () => void;
  onJoin: (channel: string) => Promise<void>;
};

export function ChannelListDialog(props: ChannelListDialogProps) {
  const [query, setQuery] = useState('');
  const [selection, setSelection] = useState<{ networkId: string | null; name: string } | null>(null);
  const deferredQuery = useDeferredValue(query);
  const search = deferredQuery.trim().toLowerCase();
  const filteredEntries = useMemo(() => filterChannelListEntries(props.state.entries, search), [props.state.entries, search]);
  const selected = filteredEntries.find(entry => selection?.networkId === props.state.networkId && entry.name === selection.name) ?? filteredEntries[0] ?? null;

  useEffect(() => {
    setQuery('');
    setSelection(null);
  }, [props.state.networkId, props.state.open]);

  return (
    <Dialog open={props.state.open} onOpenChange={(open) => !open && props.onClose()}>
      <DialogContent className="h-[min(90dvh,44rem)] max-h-[90dvh] gap-0 overflow-hidden p-0 sm:w-[min(calc(100vw-1rem),72rem)]">
        <div className="flex h-full min-h-0 flex-col">
          <div className="shrink-0 space-y-4 border-b border-white/6 px-5 py-4">
            <DialogHeader className="space-y-1">
              <DialogTitle>Channel List</DialogTitle>
              <DialogDescription>{props.network?.name ?? 'Server'} · Find a conversation to join.</DialogDescription>
            </DialogHeader>
            <div className="flex items-center gap-4">
              <div className="relative min-w-0 flex-1">
                <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input aria-label="Search channels" className="pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search channel names or topics" />
              </div>
              <p role="status" className="shrink-0 text-xs text-muted-foreground">{buildStatusText(props.state, filteredEntries.length, search.length > 0)}</p>
            </div>
          </div>
          <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_20rem]">
            <div className="min-h-0 min-w-0 py-3">
              {filteredEntries.length ? <Virtuoso
                style={{ height: '100%' }} data={filteredEntries} computeItemKey={resolveChannelListItemKey}
                itemContent={(_index, entry) => <ChannelListRow entry={entry} selected={entry.name === selected?.name} onSelect={() => setSelection({ networkId: props.state.networkId, name: entry.name })} />}
              /> : <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">{buildEmptyStateText(props.state, search.length > 0)}</div>}
            </div>
            <section aria-label="Selected channel" className="flex min-h-0 flex-col border-l border-white/6 bg-black/10">
              <div className="min-h-0 flex-1 overflow-y-auto p-5">
                <p className="mb-4 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Selected channel</p>
                {selected ? <>
                  <h3 className="break-words text-lg font-semibold text-foreground">{selected.name}</h3>
                  <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground"><Users aria-hidden className="size-3.5" />{selected.users} {selected.users === 1 ? 'user' : 'users'}</p>
                  <div className="mt-6 border-t border-white/6 pt-4">
                    <h4 className="mb-2 text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Topic</h4>
                    <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground/85">{selected.topic || 'No topic set.'}</p>
                  </div>
                </> : <p className="text-sm text-muted-foreground">{filteredEntries.length ? 'Select a channel to see its topic.' : 'No channel selected.'}</p>}
              </div>
              <div className="border-t border-white/6 p-4">
                <Button className="w-full" disabled={!selected} aria-label={selected ? `Join ${selected.name}` : 'Join channel'} onClick={() => { if (selected) void props.onJoin(selected.name); }}><ArrowRight />Join channel</Button>
              </div>
            </section>
          </div>
          <div className="flex shrink-0 items-center justify-between gap-3 border-t border-white/6 px-5 py-3">
            <p className="text-xs text-muted-foreground">{props.state.error || buildFooterText(props.state)}</p>
            <Button variant="outline" onClick={props.onClose}>Close</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const ChannelListRow = memo(function ChannelListRow(props: { entry: ChannelListEntry; selected: boolean; onSelect: () => void }) {
  return <div className="px-3 pb-1">
    <button type="button" aria-label={`Select ${props.entry.name}`} aria-pressed={props.selected} onClick={props.onSelect}
      className={cn('flex w-full min-w-0 items-center gap-3 rounded-lg px-3 py-2 text-left ring-1 ring-inset ring-border outline-none focus-visible:ring-2 focus-visible:ring-primary', props.selected ? 'bg-primary/10' : 'hover:bg-white/5')}>
      <Hash aria-hidden className={cn('size-4 shrink-0', props.selected ? 'text-primary' : 'text-muted-foreground')} />
      <span className="flex min-w-0 flex-1 items-center gap-3"><span className="w-32 shrink-0 truncate text-sm font-semibold">{props.entry.name}</span><span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{props.entry.topic || 'No topic'}</span></span>
      <span title={`${props.entry.users} users`} className="flex shrink-0 items-center gap-1.5 text-xs tabular-nums text-muted-foreground"><Users aria-hidden className="size-3" />{props.entry.users}</span>
    </button>
  </div>;
});

const filterChannelListEntries = (entries: ChannelListEntry[], search: string) => {
  if (!search) {
    return entries;
  }
  return entries.filter(
    (entry) => entry.name.toLowerCase().includes(search) || entry.topic.toLowerCase().includes(search),
  );
};

const resolveChannelListItemKey = (
  index: number,
  entry: ChannelListEntry | undefined,
) => entry ? `${entry.name}:${entry.users}:${entry.topic}:${index}` : `channel-list-row:${index}`;

const buildStatusText = (state: ChannelListState, visibleCount: number, filtered: boolean) => {
  const retained = state.entries.length;
  const total = state.totalEntries ?? retained;
  const truncation = state.truncated ? ` · first ${retained} of ${total}` : '';
  if (state.status === 'loading') {
    return filtered
      ? `Scanning ${total} channels · showing ${visibleCount}${truncation}`
      : `Scanning ${total} channels${truncation}`;
  }
  if (filtered) {
    return `Showing ${visibleCount} of ${retained} channels${truncation}`;
  }
  if (state.status === 'error') {
    return retained > 0 ? `Loaded ${retained} channels before the request stopped` : 'The request did not complete';
  }
  return `${retained} channel${retained === 1 ? '' : 's'}${truncation}`;
};

const buildFooterText = (state: ChannelListState) => {
  const retained = state.entries.length;
  const total = state.totalEntries ?? retained;
  if (state.truncated) {
    return `First ${retained} of ${total} channels loaded`;
  }
  return `${retained} channel${retained === 1 ? '' : 's'} loaded`;
};

const buildEmptyStateText = (state: ChannelListState, filtered: boolean) => {
  if (filtered) {
    return 'No channels match that search yet.';
  }
  if (state.status === 'loading') {
    return 'Waiting for the server to stream channel results.';
  }
  if (state.status === 'error') {
    return state.error ?? 'The channel list could not be loaded.';
  }
  return 'The server did not return any channels.';
};
