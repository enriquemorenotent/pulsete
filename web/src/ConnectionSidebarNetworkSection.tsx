import { Hash, MessageSquareMore, PowerOff, RefreshCcw, X } from 'lucide-react';
import { cn } from '@/lib/utils.js';
import { resolveBufferActivityState } from './buffer-activity.js';
import { ConnectionSidebarBufferRow } from './ConnectionSidebarBufferRow.js';
import { ConnectionSidebarPendingChannelRow } from './ConnectionSidebarPendingChannelRow.js';
import { ConnectionSidebarActivityBadge } from './ConnectionSidebarUnreadBadge.js';
import type { SidebarConnectionView } from './connection-sidebar-view.js';
import type { ConnectionSidebarProps } from './connection-sidebar-types.js';
import type { NetworkRuntimeState } from './workspace.js';

type ConnectionSidebarNetworkSectionProps = {
	connection: SidebarConnectionView;
	index: number;
	queryPresence: Record<string, boolean>;
	onSelectNetwork: ConnectionSidebarProps['onSelectNetwork'];
	onSelectBuffer: ConnectionSidebarProps['onSelectBuffer'];
	onSelectPendingChannel: ConnectionSidebarProps['onSelectPendingChannel'];
	onReconnectNetwork: ConnectionSidebarProps['onReconnectNetwork'];
	onDisconnectNetwork: ConnectionSidebarProps['onDisconnectNetwork'];
	onCloseConnection: ConnectionSidebarProps['onCloseConnection'];
	onCloseChannel: ConnectionSidebarProps['onCloseChannel'];
	onCloseBuffer: ConnectionSidebarProps['onCloseBuffer'];
};

export function ConnectionSidebarNetworkSection(
	props: ConnectionSidebarNetworkSectionProps,
) {
	const { connection } = props;
	const serverActivity = resolveBufferActivityState(connection.serverBuffer);

	return (
		<section
			className={cn(
				'space-y-2',
				props.index > 0 && 'border-t border-white/6 pt-4',
			)}
		>
			<div
				className={cn(
					'group flex items-stretch rounded-md transition-colors',
					connection.selectedServer
						? 'bg-white/6 ring-1 ring-inset ring-primary/24 shadow-[0_10px_30px_rgba(0,0,0,0.18)]'
						: 'hover:bg-white/3',
				)}
			>
				<button
					className="flex min-w-0 flex-1 items-center gap-3 p-2 text-left"
					onClick={() => props.onSelectNetwork(connection.network)}
				>
					<span
						className={cn(
							'size-2.5 shrink-0 rounded-full shadow-[0_0_0_4px_rgba(255,255,255,0.03)]',
							dotTone(connection.runtime),
						)}
					/>
					<div className="min-w-0 flex-1">
						<div className="flex min-w-0 items-center gap-2">
							<span
								className={cn(
									'truncate text-[13px] text-foreground',
									serverActivity.hasUnread
										? 'font-semibold'
										: 'font-medium',
								)}
							>
								{connection.labelParts.name}
							</span>
							{serverActivity.hasUnread ? (
								<ConnectionSidebarActivityBadge
									count={serverActivity.count}
									priority={serverActivity.priority}
								/>
							) : null}
						</div>
						<div className="mt-1 flex min-w-0 flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
							<span className="font-mono normal-case tracking-normal text-muted-foreground/80">
								as {connection.labelParts.nick}
							</span>
							{connection.labelParts.instanceIndex ===
							null ? null : (
								<span className="shrink-0 text-[11px] text-muted-foreground">
									· {connection.labelParts.instanceIndex}
								</span>
							)}
						</div>
					</div>
				</button>
				<div className="flex shrink-0 items-center gap-1 px-1.5 opacity-70 transition-opacity group-hover:opacity-100">
					<button
						className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-white/8 hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
						onClick={() =>
							connection.runtime?.phase === 'connected'
								? props.onDisconnectNetwork(
										connection.network.id,
									)
								: props.onReconnectNetwork(connection.network)
						}
						aria-label={`${connection.runtime?.phase === 'connected' ? 'Disconnect' : 'Reconnect'} ${connection.label}`}
						disabled={connection.runtime?.phase === 'connecting'}
					>
						{connection.runtime?.phase === 'connected' ? (
							<PowerOff className="size-3.5" />
						) : (
							<RefreshCcw className="size-3.5" />
						)}
					</button>
					<button
						className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-white/8 hover:text-foreground"
						onClick={() =>
							props.onCloseConnection(connection.network)
						}
						aria-label={`Close ${connection.label}`}
					>
						<X className="size-3.5" />
					</button>
				</div>
			</div>
			{connection.childBuffers.length > 0 ||
			connection.pendingChannels.length > 0 ? (
				<div className="space-y-1">
					{connection.childBuffers.map(({ buffer, selected }) =>
						buffer.kind === 'channel' ? (
							<ConnectionSidebarBufferRow
								key={buffer.id}
								buffer={buffer}
								dimmed={connection.childBuffersDimmed}
								selected={selected}
								icon={Hash}
								presence={null}
								onSelect={() => props.onSelectBuffer(buffer)}
								onClose={() =>
									props.onCloseChannel(
										connection.network.id,
										buffer.target,
									)
								}
							/>
						) : (
							<ConnectionSidebarBufferRow
								key={buffer.id}
								buffer={buffer}
								dimmed={connection.childBuffersDimmed}
								selected={selected}
								icon={MessageSquareMore}
								presence={resolveQueryPresence(
									props.queryPresence,
									buffer.id,
								)}
								onSelect={() => props.onSelectBuffer(buffer)}
								onClose={() => props.onCloseBuffer(buffer)}
							/>
						),
					)}
					{connection.pendingChannels.map(
						({ pendingChannel, selected }) => (
							<ConnectionSidebarPendingChannelRow
								key={`${pendingChannel.networkId}:${pendingChannel.channel}`}
								pendingChannel={pendingChannel}
								selected={selected}
								onSelect={() =>
									props.onSelectPendingChannel(
										pendingChannel.networkId,
										pendingChannel.channel,
									)
								}
							/>
						),
					)}
				</div>
			) : null}
		</section>
	);
}

const resolveQueryPresence = (
	queryPresence: Record<string, boolean>,
	bufferId: string,
): 'online' | 'offline' | null => {
	if (!(bufferId in queryPresence)) {
		return null;
	}
	return queryPresence[bufferId] ? 'online' : 'offline';
};

const dotTone = (runtime: NetworkRuntimeState | null) => {
	if (runtime?.phase === 'connected') {
		return 'bg-emerald-400';
	}
	if (runtime?.phase === 'connecting') {
		return 'bg-amber-300';
	}
	return 'bg-zinc-500';
};
