import { memo, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Virtuoso } from 'react-virtuoso';
import type { ChannelListEntry, NetworkProfile } from '../../shared/protocol.js';
import type { ChannelListState } from './app-types.js';
import { Button } from '@/components/ui/button.js';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
  const deferredQuery = useDeferredValue(query);
  const search = deferredQuery.trim().toLowerCase();
  const filteredEntries = useMemo(
    () => filterChannelListEntries(props.state.entries, search),
    [props.state.entries, search],
  );

  useEffect(() => {
    if (!props.state.open) {
      setQuery('');
    }
  }, [props.state.networkId, props.state.open]);

  return (
    <Dialog open={props.state.open} onOpenChange={(open) => !open && props.onClose()}>
      <DialogContent className="h-[min(90dvh,44rem)] max-h-[90dvh] gap-0 overflow-hidden p-0 sm:w-[min(calc(100vw-1rem),72rem)]">
        <div className="flex h-full min-h-0 flex-col">
          <div className="shrink-0 space-y-3 border-b border-border px-4 py-3">
            <DialogHeader className="space-y-1">
              <DialogTitle>Channel List</DialogTitle>
              <DialogDescription>
                {props.network?.name ?? 'Server'} · {buildStatusText(props.state, filteredEntries.length, search.length > 0)}
              </DialogDescription>
            </DialogHeader>
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search channel names or topics"
            />
          </div>

          <div className="grid shrink-0 grid-cols-[minmax(0,16rem)_5rem_minmax(0,1fr)_6rem] gap-3 border-b border-border bg-secondary/60 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            <span>Channel</span>
            <span className="text-right">Users</span>
            <span>Topic</span>
            <span className="text-right">Action</span>
          </div>

          <div className="min-h-0 flex-1">
            {filteredEntries.length > 0 ? (
              <Virtuoso
                style={{ height: '100%' }}
                data={filteredEntries}
                computeItemKey={resolveChannelListItemKey}
                itemContent={(_index, entry) => (
                  <ChannelListRow entry={entry} onJoin={props.onJoin} />
                )}
              />
            ) : (
              <div className="flex h-full min-h-60 items-center justify-center px-6 py-8">
                <div className="max-w-md border border-border bg-card px-4 py-5 text-center text-[13px] text-muted-foreground">
                  {buildEmptyStateText(props.state, search.length > 0)}
                </div>
              </div>
            )}
          </div>

          <div className="shrink-0 border-t border-border px-4 py-3">
            <DialogFooter className="sm:flex-row sm:justify-between">
              <div className="text-[12px] text-muted-foreground">
                {props.state.error ? props.state.error : buildFooterText(props.state)}
              </div>
              <Button variant="outline" onClick={props.onClose}>
                Close
              </Button>
            </DialogFooter>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const ChannelListRow = memo(function ChannelListRow(props: {
  entry: ChannelListEntry;
  onJoin: (channel: string) => Promise<void>;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,16rem)_5rem_minmax(0,1fr)_6rem] gap-3 border-b border-border px-4 py-2 text-[13px]">
      <span className="truncate font-medium text-foreground">{props.entry.name}</span>
      <span className="text-right font-mono text-muted-foreground">{props.entry.users}</span>
      <span className="truncate text-muted-foreground">{props.entry.topic || 'No topic'}</span>
      <div className="flex justify-end">
        <Button size="sm" variant="outline" onClick={() => void props.onJoin(props.entry.name)}>
          Join
        </Button>
      </div>
    </div>
  );
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
