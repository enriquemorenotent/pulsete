import { X } from 'lucide-react';
import type { PresenceStatus } from '../../shared/protocol.js';
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
		<div className="group flex items-stretch rounded-sm transition-colors hover:bg-white/3">
			<button
				type="button"
				className="flex min-w-0 flex-1 items-center gap-1.5 px-2 py-1 text-left"
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
				{props.emoji ? (
					<span aria-hidden className="shrink-0 text-[12px] leading-none">
						{props.emoji}
					</span>
				) : null}
				<span
					className={cn(
						'truncate text-[12px]',
						props.presence !== 'offline'
							? 'text-foreground'
							: 'text-muted-foreground/90',
					)}
				>
					{props.friend.nick}
				</span>
			</button>
			<button
				type="button"
				className="px-2 text-muted-foreground opacity-0 transition-all group-hover:opacity-100 hover:text-foreground"
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
	return 'bg-neutral-700';
};
