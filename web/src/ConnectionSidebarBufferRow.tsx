import type { ComponentType } from 'react';
import { X } from 'lucide-react';
import type { BufferState, PresenceStatus } from '../../shared/protocol.js';
import { cn } from '@/lib/utils.js';
import { resolveBufferActivityState } from './buffer-activity.js';
import { ConnectionSidebarActivityBadge } from './ConnectionSidebarUnreadBadge.js';

type BufferPresenceDisplay = PresenceStatus | 'pending';

type ConnectionSidebarBufferRowProps = {
	buffer: BufferState;
	dimmed: boolean;
	selected: boolean;
	icon: ComponentType<{ className?: string }>;
	presence: BufferPresenceDisplay | null;
	onSelect: () => void;
	onClose: () => void;
};

export function ConnectionSidebarBufferRow(
	props: ConnectionSidebarBufferRowProps,
) {
	const Icon = props.icon;
	const activity = resolveBufferActivityState(props.buffer);

	return (
		<div
			className={cn(
				'group flex items-stretch rounded-lg transition-colors',
				props.selected
					? 'bg-white/5 ring-1 ring-inset ring-white/8'
					: 'hover:bg-white/3',
			)}
		>
			<button
				className={cn(
					'flex min-w-0 flex-1 items-center gap-2.5 p-2 text-left',
					props.dimmed && 'opacity-70',
				)}
				onClick={props.onSelect}
				aria-label={
					props.presence
						? `Open ${props.buffer.target} (${presenceLabel(props.presence)})`
						: `Open ${props.buffer.target}`
				}
			>
				<span className="relative flex size-4 shrink-0 items-center justify-center">
					<Icon
						className={cn(
							'size-3.5 shrink-0',
							props.presence
								? presenceIconTone(props.presence)
								: 'text-muted-foreground',
						)}
					/>
					{props.presence ? (
						<span
							aria-hidden
							className={cn(
								'absolute -bottom-0.5 -right-0.5 size-2 rounded-full shadow-[0_0_0_2px_rgba(8,8,10,0.95)]',
								presenceBadgeTone(props.presence),
							)}
						/>
					) : null}
				</span>
				<span
					className={cn(
						'truncate text-[13px]',
						activity.priority
							? 'font-semibold text-foreground'
							: 'text-foreground',
						activity.hasUnread &&
							!activity.priority &&
							'font-medium text-foreground',
						props.dimmed &&
							!activity.hasUnread &&
							'text-muted-foreground',
						props.presence === 'offline' &&
							!activity.hasUnread &&
							'text-muted-foreground/90',
					)}
				>
					{props.buffer.target}
				</span>
				{activity.hasUnread ? (
					<ConnectionSidebarActivityBadge
						count={activity.count}
						priority={activity.priority}
					/>
				) : null}
			</button>
			<button
				className="px-3 text-muted-foreground opacity-0 transition-all group-hover:opacity-100 hover:text-foreground"
				onClick={props.onClose}
				aria-label={`Close ${props.buffer.target}`}
			>
				<X className="size-3" />
			</button>
		</div>
	);
}

const presenceLabel = (presence: BufferPresenceDisplay) =>
	presence === 'pending' ? 'checking status' : presence;

const presenceIconTone = (presence: BufferPresenceDisplay) => {
	if (presence === 'pending') {
		return 'text-zinc-400';
	}
	if (presence === 'online') {
		return 'text-emerald-400';
	}
	if (presence === 'away') {
		return 'text-yellow-400';
	}
	return 'text-red-400';
};

const presenceBadgeTone = (presence: BufferPresenceDisplay) => {
	if (presence === 'pending') {
		return 'bg-zinc-400';
	}
	if (presence === 'online') {
		return 'bg-emerald-400';
	}
	if (presence === 'away') {
		return 'bg-yellow-400';
	}
	return 'bg-red-400';
};
