import { ScrollArea } from '@/components/ui/scroll-area.js';
import { ConnectionSidebarNetworkSection } from './ConnectionSidebarNetworkSection.js';
import type { ConnectionSidebarProps } from './connection-sidebar-types.js';

type ConnectionSidebarConnectionsProps = Pick<
	ConnectionSidebarProps,
	| 'queryPresence'
	| 'nickEmojis'
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

export function ConnectionSidebarConnections(
	props: ConnectionSidebarConnectionsProps,
) {
	return (
		<section className="flex min-h-0 flex-[3_1_0%] flex-col overflow-hidden px-2.5 py-2">
			<div className="mb-1 px-1">
				<h2 className="text-[12px] font-semibold tracking-tight text-foreground">
					Connections
				</h2>
			</div>
			<ScrollArea className="min-h-0 flex-1">
				<div className="space-y-2 pr-0.5">
					{props.connections.length === 0 ? (
						<div className="rounded-md bg-black/10 px-2 py-1.5 text-[12px] text-muted-foreground ring-1 ring-white/5">
							No open connections. Use Network Manager to connect.
						</div>
					) : null}
					{props.connections.map((connection, index) => (
						<ConnectionSidebarNetworkSection
							key={connection.network.id}
							connection={connection}
							index={index}
							nickEmojis={props.nickEmojis}
							queryPresence={props.queryPresence ?? {}}
							onSelectNetwork={props.onSelectNetwork}
							onSelectBuffer={props.onSelectBuffer}
							onSelectPendingChannel={
								props.onSelectPendingChannel
							}
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
