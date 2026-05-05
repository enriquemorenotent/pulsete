import { X } from 'lucide-react';
import type { PresenceStatus } from '../../shared/protocol-chat.js';
import { cn } from '@/lib/utils.js';
import type { ConnectionSidebarProps } from './connection-sidebar-types.js';

type FriendRowProps = {
	emoji: string | null;
	friend: ConnectionSidebarProps['friends'][number];
	presence: PresenceStatus;
	onOpen: () => void;
	onRemove: () => void;
};

export function FriendRow(props: FriendRowProps) {
	return (
		<div className="group flex items-stretch rounded-sm transition-colors hover:bg-white/[0.025] focus-within:bg-white/[0.03]">
			<button
				type="button"
				className="flex min-w-0 flex-1 items-center gap-1.5 rounded-sm px-2 py-1 text-left outline-none focus-visible:ring-1 focus-visible:ring-primary/35"
				onClick={props.onOpen}
				aria-label={`Open ${props.friend.nick} (${props.presence})`}
			>
				<span
					aria-hidden
					className={cn(
						'size-2 shrink-0 rounded-full',
						friendPresenceTone(props.presence),
					)}
				/>
				<span
					className={cn(
						'truncate text-[12px]',
						props.presence !== 'offline'
							? 'text-muted-foreground/90'
							: 'text-muted-foreground/55',
					)}
				>
					{props.friend.nick}
				</span>
				{props.emoji ? (
					<span aria-hidden className="shrink-0 text-[12px] leading-none">
						{props.emoji}
					</span>
				) : null}
			</button>
			<button
				type="button"
				className="flex w-7 shrink-0 items-center justify-center rounded-sm text-muted-foreground/80 opacity-0 transition-opacity duration-150 hover:bg-white/[0.05] hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/35 group-hover:opacity-100 group-focus-within:opacity-100"
				aria-label={`Remove ${props.friend.nick} from watchlist`}
				onClick={props.onRemove}
			>
				<X className="size-3" />
			</button>
		</div>
	);
}

const friendPresenceTone = (presence: PresenceStatus) => {
	if (presence === 'online') {
		return 'bg-emerald-400';
	}
	if (presence === 'away') {
		return 'bg-yellow-400';
	}
	return 'bg-neutral-700/70';
};
