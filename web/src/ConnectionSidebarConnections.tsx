import { ScrollArea } from '@/components/ui/scroll-area.js';
import { ConnectionSidebarNetworkSection } from './ConnectionSidebarNetworkSection.js';
import type { ConnectionSidebarProps } from './connection-sidebar-types.js';

type ConnectionSidebarConnectionsProps = Pick<
  ConnectionSidebarProps,
  | 'connections'
  | 'draftBufferIds'
  | 'onSelectNetwork'
  | 'onSelectBuffer'
  | 'onSelectPendingChannel'
  | 'onReconnectNetwork'
  | 'onDisconnectNetwork'
  | 'onCloseConnection'
  | 'onCloseChannel'
  | 'onCloseBuffer'
>;

export function ConnectionSidebarConnections(
  props: ConnectionSidebarConnectionsProps,
) {
  return (
    <section className="flex min-h-0 flex-[3_1_0%] flex-col overflow-hidden">
      <div className="mb-3 flex items-end justify-between gap-3 px-1">
        <div>
          <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
            Connections
          </p>
          <h2 className="text-sm font-semibold tracking-tight text-foreground">
            Buffers
          </h2>
        </div>
        <span className="rounded-full bg-white/[0.05] px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
          {props.connections.length}
        </span>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-4 pr-1">
          {props.connections.length === 0 ? (
            <div className="rounded-[1rem] bg-black/10 px-3 py-3 text-[13px] text-muted-foreground ring-1 ring-white/[0.05]">
              No open connections. Use Network Manager to connect.
            </div>
          ) : null}
          {props.connections.map((connection, index) => (
            <ConnectionSidebarNetworkSection
              key={connection.network.id}
              connection={connection}
              draftBufferIds={props.draftBufferIds}
              index={index}
              onSelectNetwork={props.onSelectNetwork}
              onSelectBuffer={props.onSelectBuffer}
              onSelectPendingChannel={props.onSelectPendingChannel}
              onReconnectNetwork={props.onReconnectNetwork}
              onDisconnectNetwork={props.onDisconnectNetwork}
              onCloseConnection={props.onCloseConnection}
              onCloseChannel={props.onCloseChannel}
              onCloseBuffer={props.onCloseBuffer}
            />
          ))}
        </div>
      </ScrollArea>
    </section>
  );
}
