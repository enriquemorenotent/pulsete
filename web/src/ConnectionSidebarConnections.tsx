import { ScrollArea } from '@/components/ui/scroll-area.js';
import { ConnectionSidebarNetworkSection } from './ConnectionSidebarNetworkSection.js';
import type { ConnectionSidebarProps } from './connection-sidebar-types.js';

type ConnectionSidebarConnectionsProps = Pick<
  ConnectionSidebarProps,
  | 'connections'
  | 'onSelectNetwork'
  | 'onSelectBuffer'
  | 'onSelectPendingChannel'
  | 'onReconnectNetwork'
  | 'onDisconnectNetwork'
  | 'onCloseConnection'
  | 'onCloseChannel'
  | 'onCloseBuffer'
>;

export function ConnectionSidebarConnections(props: ConnectionSidebarConnectionsProps) {
  return (
    <section className="flex min-h-0 flex-[3_1_0%] flex-col overflow-hidden border border-border bg-card">
      <ScrollArea className="min-h-0 flex-1">
        <div className="p-2">
          {props.connections.length === 0 ? (
            <div className="px-2 py-2 text-[13px] text-muted-foreground">
              No open connections. Use Network Manager to connect.
            </div>
          ) : null}
          {props.connections.map((connection, index) => (
            <ConnectionSidebarNetworkSection
              key={connection.network.id}
              connection={connection}
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
