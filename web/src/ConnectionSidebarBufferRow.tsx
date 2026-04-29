import type { ComponentType } from 'react';
import { X } from 'lucide-react';
import type { BufferState, PresenceStatus } from '../../shared/protocol.js';
import { cn } from '@/lib/utils.js';
import { resolveBufferActivityState } from './buffer-activity.js';
import { connectionSidebarLabelClass } from './connection-sidebar-label-class.js';

type BufferPresenceDisplay = PresenceStatus | 'pending';

type ConnectionSidebarBufferRowProps = {
	buffer: BufferState;
	dimmed: boolean;
	selected: boolean;
	icon: ComponentType<{ className?: string }>;
	presence: BufferPresenceDisplay | null;
	emoji?: string | null;
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
				'group flex items-stretch rounded-sm transition-colors',
				props.selected
					? 'bg-white/5 ring-1 ring-inset ring-white/8'
					: 'hover:bg-white/3',
			)}
		>
			<button
				className={cn(
					'flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left',
					props.dimmed && 'opacity-70',
				)}
				onClick={props.onSelect}
				aria-label={resolveBufferAriaLabel(
					props.buffer.target,
					props.presence,
					activity.hasUnread,
				)}
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
					{activity.hasUnread ? (
						<span
							aria-hidden
							className={cn(
								'absolute -bottom-0.5 -right-0.5 size-2 rounded-full shadow-[0_0_0_2px_rgba(8,8,10,0.95)]',
								unreadBadgeTone(),
							)}
						/>
					) : null}
				</span>
				<span
					className={connectionSidebarLabelClass(activity, {
						dimmed: props.dimmed,
						offline: props.presence === 'offline',
					})}
				>
					{props.emoji ? (
						<span className="mr-1 text-[12px] leading-none" aria-hidden>
							{props.emoji}
						</span>
					) : null}
					{props.buffer.target}
				</span>
			</button>
			<button
				className="px-2 text-muted-foreground opacity-0 transition-all group-hover:opacity-100 hover:text-foreground"
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

const resolveBufferAriaLabel = (
	target: string,
	presence: BufferPresenceDisplay | null,
	hasUnread: boolean,
) => {
	if (presence) {
		return hasUnread
			? `Open ${target} (${presenceLabel(presence)}, unread)`
			: `Open ${target} (${presenceLabel(presence)})`;
	}
	return hasUnread ? `Open ${target} (unread)` : `Open ${target}`;
};

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

const unreadBadgeTone = () => 'bg-primary';
