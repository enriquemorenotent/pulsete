import { Hash, MessageSquareMore, PowerOff, RefreshCcw, Server, X } from 'lucide-react';
import type { PresenceStatus } from '../../shared/protocol.js';
import { cn } from '@/lib/utils.js';
import { resolveBufferActivityState } from './buffer-activity.js';
import { ConnectionSidebarBufferRow } from './ConnectionSidebarBufferRow.js';
import { ConnectionSidebarPendingChannelRow } from './ConnectionSidebarPendingChannelRow.js';
import { connectionSidebarLabelClass } from './connection-sidebar-label-class.js';
import type { SidebarConnectionView } from './connection-sidebar-view.js';
import type { ConnectionSidebarProps } from './connection-sidebar-types.js';
import { findNickEmoji } from './nick-emoji-utils.js';
import type { NetworkRuntimeState } from './workspace.js';

type QueryPresenceDisplay = PresenceStatus | 'pending';

type ConnectionSidebarNetworkSectionProps = {
	connection: SidebarConnectionView;
	index: number;
	nickEmojis: ConnectionSidebarProps['nickEmojis'];
	queryPresence: Record<string, PresenceStatus>;
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
				'space-y-1',
				props.index > 0 && 'border-t border-white/6 pt-2',
			)}
		>
			<div
				className={cn(
					'group flex items-stretch rounded-sm transition-colors',
					connection.selectedServer
						? 'bg-white/6 ring-1 ring-inset ring-primary/24'
						: 'hover:bg-white/3',
				)}
			>
				<button
					className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left"
					onClick={() => props.onSelectNetwork(connection.network)}
					aria-label={
						serverActivity.hasUnread
							? `Open ${connection.labelParts.name} (unread)`
							: `Open ${connection.labelParts.name}`
					}
				>
					<span className="relative flex size-4 shrink-0 items-center justify-center">
						<Server
							aria-hidden
							className={cn(
								'size-3.5 shrink-0',
								serverIconTone(connection.runtime),
							)}
						/>
						{serverActivity.hasUnread ? (
							<span
								aria-hidden
								className={cn(
									'absolute -bottom-0.5 -right-0.5 size-2 rounded-full shadow-[0_0_0_2px_rgba(8,8,10,0.95)]',
									unreadBadgeTone(),
								)}
							/>
						) : null}
					</span>
					<div className="min-w-0 flex-1">
						<div className="flex min-w-0 items-center gap-2">
							<span className={connectionSidebarLabelClass(serverActivity)}>
								{connection.labelParts.name}
							</span>
						</div>
					</div>
				</button>
				<div className="flex shrink-0 items-center gap-0.5 px-1 opacity-70 transition-opacity group-hover:opacity-100">
					<button
						className="rounded-sm p-1.5 text-muted-foreground transition-colors hover:bg-white/8 hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
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
							<PowerOff className="size-3" />
						) : (
							<RefreshCcw className="size-3" />
						)}
					</button>
					<button
						className="rounded-sm p-1.5 text-muted-foreground transition-colors hover:bg-white/8 hover:text-foreground"
						onClick={() =>
							props.onCloseConnection(connection.network)
						}
						aria-label={`Close ${connection.label}`}
					>
						<X className="size-3" />
					</button>
				</div>
			</div>
			{connection.childBuffers.length > 0 ||
			connection.pendingChannels.length > 0 ? (
				<div className="space-y-px">
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
									connection.runtime,
									props.queryPresence,
									buffer.id,
								)}
								emoji={
									findNickEmoji(
										props.nickEmojis,
										connection.network.id,
										buffer.target,
									)?.emoji ?? null
								}
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
	runtime: NetworkRuntimeState | null,
	queryPresence: Record<string, PresenceStatus>,
	bufferId: string,
) : QueryPresenceDisplay | null => {
	if (!(bufferId in queryPresence)) {
		return runtime?.phase === 'connected' ? 'pending' : null;
	}
	return queryPresence[bufferId] ?? null;
};

const serverIconTone = (runtime: NetworkRuntimeState | null) => {
	if (runtime?.phase === 'connected') {
		return 'text-emerald-400';
	}
	if (runtime?.phase === 'connecting') {
		return 'text-amber-300';
	}
	return 'text-zinc-500';
};

const unreadBadgeTone = () => 'bg-primary';
