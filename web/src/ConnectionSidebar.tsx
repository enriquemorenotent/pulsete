import { Hash, MessageSquareMore, X } from 'lucide-react';
import type { BufferState, ChannelState, NetworkProfile } from '../../shared/protocol.js';
import { Card } from '@/components/ui/card.js';
import { ScrollArea } from '@/components/ui/scroll-area.js';
import { cn } from '@/lib/utils.js';
import type { NetworkRuntimeState, SelectedBuffer } from './workspace.js';
import { canShowInstanceChildren, getConnectionLabel } from './workspace.js';

type ConnectionSidebarProps = {
  networks: NetworkProfile[];
  buffers: BufferState[];
  channels: ChannelState[];
  networkStates: Record<string, NetworkRuntimeState>;
  selection: SelectedBuffer | null;
  onSelectNetwork: (network: NetworkProfile) => void;
  onSelectBuffer: (buffer: BufferState) => void;
  onCloseConnection: (network: NetworkProfile) => void;
  onCloseChannel: (networkId: string, channel: string) => void;
  onCloseBuffer: (buffer: BufferState) => void;
};

export function ConnectionSidebar(props: ConnectionSidebarProps) {
  return (
    <aside className="h-full min-h-0 overflow-hidden">
      <Card className="flex h-full min-h-0 flex-col overflow-hidden">
        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-2 p-2">
            {props.networks.length === 0 ? (
              <div className="border border-border bg-secondary px-3 py-2 text-[13px] text-muted-foreground">
                No open connections. Use Network List to connect.
              </div>
            ) : null}

            {props.networks.map((network) => {
              const runtime = props.networkStates[network.id] ?? null;
              const networkBuffers = props.buffers.filter((buffer) => buffer.networkId === network.id);
              const serverBuffer = networkBuffers.find((buffer) => buffer.kind === 'server') ?? null;
              const childBuffers = canShowInstanceChildren(runtime)
                ? networkBuffers.filter((buffer) => buffer.kind !== 'server').sort(compareBuffers)
                : [];
              const selectedServer = props.selection?.bufferId === serverBuffer?.id;
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
                        <span className="truncate text-[13px] font-medium text-foreground">{label}</span>
                        <p className="truncate font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                          {runtime?.connected ? 'Connected' : runtime?.connecting ? 'Connecting' : 'Offline'}
                        </p>
                      </div>
                      {serverBuffer && serverBuffer.unread > 0 ? <UnreadBadge unread={serverBuffer.unread} /> : null}
                    </button>
                    <button
                      className="border-l border-border px-2 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                      onClick={() => props.onCloseConnection(network)}
                      aria-label={`Close ${label}`}
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>

                  {childBuffers.length > 0 ? (
                    <div className="border-t border-border/80 bg-background/50">
                      {childBuffers.map((buffer) =>
                        buffer.kind === 'channel' ? (
                          <SidebarChannelRow
                            key={buffer.id}
                            buffer={buffer}
                            selected={props.selection?.bufferId === buffer.id}
                            onSelect={() => props.onSelectBuffer(buffer)}
                            onClose={() => props.onCloseChannel(network.id, buffer.target)}
                          />
                        ) : (
                          <SidebarQueryRow
                            key={buffer.id}
                            buffer={buffer}
                            selected={props.selection?.bufferId === buffer.id}
                            onSelect={() => props.onSelectBuffer(buffer)}
                            onClose={() => props.onCloseBuffer(buffer)}
                          />
                        )
                      )}
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
  buffer: BufferState;
  selected: boolean;
  onSelect: () => void;
  onClose: () => void;
}) {
  return (
    <div className={cn('flex items-stretch border-b border-border/70 last:border-b-0', props.selected && 'bg-accent')}>
      <button className="flex min-w-0 flex-1 items-center gap-2 px-3 py-1.5 text-left" onClick={props.onSelect}>
        <Hash className="size-3 shrink-0 text-muted-foreground" />
        <span className="truncate text-[13px] text-foreground">{props.buffer.target}</span>
        {props.buffer.unread > 0 ? <UnreadBadge unread={props.buffer.unread} /> : null}
      </button>
      <button
        className="border-l border-border/70 px-2 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        onClick={props.onClose}
        aria-label={`Close ${props.buffer.target}`}
      >
        <X className="size-3" />
      </button>
    </div>
  );
}

function SidebarQueryRow(props: {
  buffer: BufferState;
  selected: boolean;
  onSelect: () => void;
  onClose: () => void;
}) {
  return (
    <div className={cn('flex items-stretch border-b border-border/70 last:border-b-0', props.selected && 'bg-accent')}>
      <button className="flex min-w-0 flex-1 items-center gap-2 px-3 py-1.5 text-left" onClick={props.onSelect}>
        <MessageSquareMore className="size-3 shrink-0 text-muted-foreground" />
        <span className="truncate text-[13px] text-foreground">{props.buffer.target}</span>
        {props.buffer.unread > 0 ? <UnreadBadge unread={props.buffer.unread} /> : null}
      </button>
      <button
        className="border-l border-border/70 px-2 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        onClick={props.onClose}
        aria-label={`Close ${props.buffer.target}`}
      >
        <X className="size-3" />
      </button>
    </div>
  );
}

function UnreadBadge(props: { unread: number }) {
  return (
    <span className="ml-auto rounded-sm border border-border px-1.5 py-0.5 font-mono text-[10px] tracking-normal text-muted-foreground">
      {props.unread}
    </span>
  );
}

const compareBuffers = (left: BufferState, right: BufferState) => {
  const order = { server: 0, channel: 1, query: 2 } satisfies Record<BufferState['kind'], number>;
  return order[left.kind] - order[right.kind] || left.target.localeCompare(right.target);
};

const dotTone = (runtime: NetworkRuntimeState | null) => {
  if (runtime?.connected) {
    return 'bg-emerald-400';
  }
  if (runtime?.connecting) {
    return 'bg-amber-300';
  }
  return 'bg-zinc-500';
};
