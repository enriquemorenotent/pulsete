import { Hash, MessageSquareMore, PowerOff, RefreshCcw, X } from 'lucide-react';
import { cn } from '@/lib/utils.js';
import { ConnectionSidebarBufferRow } from './ConnectionSidebarBufferRow.js';
import { ConnectionSidebarPendingChannelRow } from './ConnectionSidebarPendingChannelRow.js';
import { ConnectionSidebarUnreadBadge } from './ConnectionSidebarUnreadBadge.js';
import type { SidebarConnectionView } from './connection-sidebar-view.js';
import type { ConnectionSidebarProps } from './connection-sidebar-types.js';
import type { NetworkRuntimeState } from './workspace.js';

type ConnectionSidebarNetworkSectionProps = {
  connection: SidebarConnectionView;
  index: number;
  onSelectNetwork: ConnectionSidebarProps['onSelectNetwork'];
  onSelectBuffer: ConnectionSidebarProps['onSelectBuffer'];
  onSelectPendingChannel: ConnectionSidebarProps['onSelectPendingChannel'];
  onReconnectNetwork: ConnectionSidebarProps['onReconnectNetwork'];
  onDisconnectNetwork: ConnectionSidebarProps['onDisconnectNetwork'];
  onCloseConnection: ConnectionSidebarProps['onCloseConnection'];
  onCloseChannel: ConnectionSidebarProps['onCloseChannel'];
  onCloseBuffer: ConnectionSidebarProps['onCloseBuffer'];
};

export function ConnectionSidebarNetworkSection(props: ConnectionSidebarNetworkSectionProps) {
  const { connection } = props;

  return (
    <section className={cn(props.index > 0 && 'mt-2 border-t border-border/70 pt-2')}>
      <div className={cn('flex items-stretch rounded-sm', connection.selectedServer && 'bg-accent')}>
        <button
          className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left hover:bg-accent/70"
          onClick={() => props.onSelectNetwork(connection.network)}
        >
          <span className={cn('size-2 shrink-0 rounded-full', dotTone(connection.runtime))} />
          <div className="min-w-0">
            <div className="flex min-w-0 items-baseline gap-1.5">
              <span className="truncate text-[13px] font-medium text-foreground">{connection.labelParts.name}</span>
              <span className="shrink-0 font-mono text-[11px] font-normal text-muted-foreground">
                as {connection.labelParts.nick}
              </span>
              {connection.labelParts.instanceIndex === null ? null : (
                <span className="shrink-0 text-[11px] text-muted-foreground">
                  · {connection.labelParts.instanceIndex}
                </span>
              )}
            </div>
          </div>
          {connection.serverBuffer && connection.serverBuffer.unread > 0 ? (
            <ConnectionSidebarUnreadBadge unread={connection.serverBuffer.unread} />
          ) : null}
        </button>
        <button
          className="px-2 text-muted-foreground transition-colors hover:bg-accent/70 hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
          onClick={() =>
            connection.runtime?.phase === 'connected'
              ? props.onDisconnectNetwork(connection.network.id)
              : props.onReconnectNetwork(connection.network)
          }
          aria-label={`${connection.runtime?.phase === 'connected' ? 'Disconnect' : 'Reconnect'} ${connection.label}`}
          disabled={connection.runtime?.phase === 'connecting'}
        >
          {connection.runtime?.phase === 'connected' ? <PowerOff className="size-3.5" /> : <RefreshCcw className="size-3.5" />}
        </button>
        <button
          className="px-2 text-muted-foreground transition-colors hover:bg-accent/70 hover:text-accent-foreground"
          onClick={() => props.onCloseConnection(connection.network)}
          aria-label={`Close ${connection.label}`}
        >
          <X className="size-3.5" />
        </button>
      </div>

      {connection.childBuffers.length > 0 || connection.pendingChannels.length > 0 ? (
        <div className="mt-1 space-y-0.5 pl-4">
          {connection.childBuffers.map(({ buffer, selected }) =>
            buffer.kind === 'channel' ? (
              <ConnectionSidebarBufferRow
                key={buffer.id}
                buffer={buffer}
                dimmed={connection.childBuffersDimmed}
                selected={selected}
                icon={Hash}
                onSelect={() => props.onSelectBuffer(buffer)}
                onClose={() => props.onCloseChannel(connection.network.id, buffer.target)}
              />
            ) : (
              <ConnectionSidebarBufferRow
                key={buffer.id}
                buffer={buffer}
                dimmed={connection.childBuffersDimmed}
                selected={selected}
                icon={MessageSquareMore}
                onSelect={() => props.onSelectBuffer(buffer)}
                onClose={() => props.onCloseBuffer(buffer)}
              />
            )
          )}
          {connection.pendingChannels.map(({ pendingChannel, selected }) => (
            <ConnectionSidebarPendingChannelRow
              key={`${pendingChannel.networkId}:${pendingChannel.channel}`}
              pendingChannel={pendingChannel}
              selected={selected}
              onSelect={() => props.onSelectPendingChannel(pendingChannel.networkId, pendingChannel.channel)}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}

const dotTone = (runtime: NetworkRuntimeState | null) => {
  if (runtime?.phase === 'connected') {
    return 'bg-emerald-400';
  }
  if (runtime?.phase === 'connecting') {
    return 'bg-amber-300';
  }
  return 'bg-zinc-500';
};
