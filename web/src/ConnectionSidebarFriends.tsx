import { X } from 'lucide-react';
import type { PresenceStatus } from '../../shared/protocol.js';
import { cn } from '@/lib/utils.js';
import type { ConnectionSidebarProps } from './connection-sidebar-types.js';

type ConnectionSidebarFriendsProps = Pick<
	ConnectionSidebarProps,
	'friends' | 'friendPresence' | 'onRemoveFriend' | 'onSelectFriend'
>;

export function ConnectionSidebarFriends(props: ConnectionSidebarFriendsProps) {
	const sortedFriends = [...props.friends].sort(
		(left, right) =>
			presenceWeight(props.friendPresence[right.id]) -
				presenceWeight(props.friendPresence[left.id]) ||
			left.nick.localeCompare(right.nick, undefined, {
				sensitivity: 'accent',
			}),
	);
	const activeFriends = sortedFriends.filter(
		(friend) =>
			resolvePresence(props.friendPresence[friend.id]) !== 'offline',
	);
	const offlineFriends = sortedFriends.filter(
		(friend) =>
			resolvePresence(props.friendPresence[friend.id]) === 'offline',
	);

	return (
		<>
			<section className="shrink-0 border-t border-white/6 p-4">
				<div className="px-2 py-1">
					<div className="min-w-0">
						<h2 className="text-[13px] font-semibold tracking-tight text-foreground">
							Friends
						</h2>
					</div>
				</div>
				<div className="mt-1 max-h-[min(32dvh,16rem)] overflow-y-auto overscroll-contain pr-0.5">
					{props.friends.length === 0 ? (
						<div className="px-2.5 py-1.5 text-[13px] text-muted-foreground">
							No friends saved yet.
						</div>
					) : (
						<div className="space-y-px border-white/6">
							{activeFriends.map((friend) => (
								<FriendRow
									key={friend.id}
									friend={friend}
									presence={resolvePresence(
										props.friendPresence[friend.id],
									)}
									onOpen={() =>
										void props.onSelectFriend(friend)
									}
									onRemove={() =>
										void props.onRemoveFriend(friend.id)
									}
								/>
							))}
							{offlineFriends.map((friend) => (
								<FriendRow
									key={friend.id}
									friend={friend}
									presence="offline"
									onOpen={() =>
										void props.onSelectFriend(friend)
									}
									onRemove={() =>
										void props.onRemoveFriend(friend.id)
									}
								/>
							))}
						</div>
					)}
				</div>
			</section>
		</>
	);
}

function FriendRow(props: {
	friend: ConnectionSidebarProps['friends'][number];
	presence: PresenceStatus;
	onOpen: () => void;
	onRemove: () => void;
}) {
	return (
		<div className="group flex items-stretch rounded-sm transition-colors hover:bg-white/3">
			<button
				type="button"
				className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left"
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
						'truncate text-[13px]',
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
				aria-label={`Remove ${props.friend.nick}`}
				onClick={props.onRemove}
			>
				<X className="size-3" />
			</button>
		</div>
	);
}

const resolvePresence = (
	presence: PresenceStatus | undefined,
): PresenceStatus => presence ?? 'offline';

const presenceWeight = (presence: PresenceStatus | undefined) => {
	if (presence === 'online') {
		return 2;
	}
	if (presence === 'away') {
		return 1;
	}
	return 0;
};

const friendPresenceTone = (presence: PresenceStatus) => {
	if (presence === 'online') {
		return 'bg-emerald-400';
	}
	if (presence === 'away') {
		return 'bg-yellow-400';
	}
	return 'bg-neutral-700';
};
