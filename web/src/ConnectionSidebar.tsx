import { Hash, MessageSquareMore, X } from 'lucide-react';
import type { ChannelState, NetworkProfile, QueryBuffer } from '../../shared/protocol.js';
import { Badge } from '@/components/ui/badge.js';
import { Card } from '@/components/ui/card.js';
import { ScrollArea } from '@/components/ui/scroll-area.js';
import { cn } from '@/lib/utils.js';
import type { NetworkRuntimeState, SelectedBuffer } from './workspace.js';
import { canShowInstanceChildren, getConnectionLabel } from './workspace.js';

type ConnectionSidebarProps = {
  networks: NetworkProfile[];
  channels: ChannelState[];
  queries: QueryBuffer[];
  networkStates: Record<string, NetworkRuntimeState>;
  selection: SelectedBuffer | null;
  onSelectNetwork: (network: NetworkProfile) => void;
  onSelectChannel: (network: NetworkProfile, channel: ChannelState) => void;
  onSelectQuery: (network: NetworkProfile, target: string) => void;
  onCloseConnection: (network: NetworkProfile) => void;
  onCloseChannel: (networkId: string, channel: string) => void;
  onCloseQuery: (networkId: string, target: string) => void;
};

export function ConnectionSidebar(props: ConnectionSidebarProps) {
  return (
    <aside className="h-full min-h-0 overflow-hidden">
      <Card className="flex h-full min-h-0 flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Connections</p>
            <h2 className="text-sm font-semibold tracking-tight">Buffers</h2>
          </div>
          <Badge variant="secondary">{props.networks.length}</Badge>
        </div>

        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-2 p-2">
            {props.networks.length === 0 ? (
              <div className="border border-border bg-secondary px-3 py-2 text-[13px] text-muted-foreground">
                No open connections. Use Network List to connect.
              </div>
            ) : null}

            {props.networks.map((network) => {
              const runtime = props.networkStates[network.id] ?? null;
              const channels = canShowInstanceChildren(runtime)
                ? props.channels.filter((channel) => channel.networkId === network.id)
                : [];
              const queries = canShowInstanceChildren(runtime)
                ? props.queries.filter((query) => query.networkId === network.id).sort((a, b) => a.target.localeCompare(b.target))
                : [];
              const selectedServer =
                props.selection?.networkId === network.id &&
                props.selection.channelId === null &&
                props.selection.target === 'server';
              const label = getConnectionLabel(props.networks, network);

              return (
                <div key={network.id} className="border border-border bg-card">
                  <div className={cn('flex items-stretch', selectedServer && 'bg-accent')}>
                    <button
                      className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left"
                      onClick={() => props.onSelectNetwork(network)}
                    >
                      <span className={cn('size-2 shrink-0 rounded-full', dotTone(runtime))} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate text-[13px] font-medium text-foreground">{label}</span>
                          {network.favorite ? <Badge>Fav</Badge> : null}
                        </div>
                        <p className="truncate font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                          {runtime?.connected ? 'Connected' : runtime?.connecting ? 'Connecting' : 'Offline'}
                        </p>
                      </div>
                    </button>
                    <button
                      className="border-l border-border px-2 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                      onClick={() => props.onCloseConnection(network)}
                      aria-label={`Close ${label}`}
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>

                  {canShowInstanceChildren(runtime) ? (
                    <div className="border-t border-border/80 bg-background/50">
                      {channels.map((channel) => (
                        <SidebarChannelRow
                          key={channel.id}
                          selected={props.selection?.networkId === network.id && props.selection?.channelId === channel.id}
                          channel={channel}
                          onSelect={() => props.onSelectChannel(network, channel)}
                          onClose={() => props.onCloseChannel(network.id, channel.name)}
                        />
                      ))}
                      {queries.map((query) => (
                        <SidebarQueryRow
                          key={query.id}
                          selected={
                            props.selection?.networkId === network.id &&
                            props.selection?.channelId === null &&
                            props.selection?.target === query.target
                          }
                          query={query}
                          onSelect={() => props.onSelectQuery(network, query.target)}
                          onClose={() => props.onCloseQuery(network.id, query.target)}
                        />
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </Card>
    </aside>
  );
}

function SidebarChannelRow(props: {
  channel: ChannelState;
  selected: boolean;
  onSelect: () => void;
  onClose: () => void;
}) {
  return (
    <div className={cn('flex items-stretch border-b border-border/70 last:border-b-0', props.selected && 'bg-accent')}>
      <button className="flex min-w-0 flex-1 items-center gap-2 px-3 py-1.5 text-left" onClick={props.onSelect}>
        <Hash className="size-3 shrink-0 text-muted-foreground" />
        <span className="truncate text-[13px] text-foreground">{props.channel.name}</span>
        {props.channel.unread > 0 ? (
          <Badge variant="outline" className="ml-auto font-mono tracking-normal">
            {props.channel.unread}
          </Badge>
        ) : null}
      </button>
      <button
        className="border-l border-border/70 px-2 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        onClick={props.onClose}
        aria-label={`Close ${props.channel.name}`}
      >
        <X className="size-3" />
      </button>
    </div>
  );
}

function SidebarQueryRow(props: {
  query: QueryBuffer;
  selected: boolean;
  onSelect: () => void;
  onClose: () => void;
}) {
  return (
    <div className={cn('flex items-stretch border-b border-border/70 last:border-b-0', props.selected && 'bg-accent')}>
      <button className="flex min-w-0 flex-1 items-center gap-2 px-3 py-1.5 text-left" onClick={props.onSelect}>
        <MessageSquareMore className="size-3 shrink-0 text-muted-foreground" />
        <span className="truncate text-[13px] text-foreground">{props.query.target}</span>
      </button>
      <button
        className="border-l border-border/70 px-2 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        onClick={props.onClose}
        aria-label={`Close ${props.query.target}`}
      >
        <X className="size-3" />
      </button>
    </div>
  );
}

const dotTone = (runtime: NetworkRuntimeState | null) => {
  if (runtime?.connected) {
    return 'bg-emerald-400';
  }
  if (runtime?.connecting) {
    return 'bg-amber-300';
  }
  return 'bg-zinc-500';
};
