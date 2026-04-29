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
		<section className="flex min-h-0 flex-[3_1_0%] flex-col overflow-hidden p-4">
			<div className="mb-3 px-1">
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					Connections
				</h2>
			</div>
			<ScrollArea className="min-h-0 flex-1">
				<div className="space-y-4 pr-1">
					{props.connections.length === 0 ? (
						<div className="rounded-2xl bg-black/10 px-3 py-3 text-[13px] text-muted-foreground ring-1 ring-white/5">
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
