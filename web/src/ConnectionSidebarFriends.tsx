import { X } from 'lucide-react';
import { cn } from '@/lib/utils.js';
import type { ConnectionSidebarProps } from './connection-sidebar-types.js';

type ConnectionSidebarFriendsProps = Pick<
	ConnectionSidebarProps,
	'friends' | 'friendPresence' | 'onRemoveFriend' | 'onSelectFriend'
>;

export function ConnectionSidebarFriends(props: ConnectionSidebarFriendsProps) {
	const sortedFriends = [...props.friends].sort(
		(left, right) =>
			Number(Boolean(props.friendPresence[right.id])) -
				Number(Boolean(props.friendPresence[left.id])) ||
			left.nick.localeCompare(right.nick, undefined, {
				sensitivity: 'accent',
			}),
	);
	const onlineFriends = sortedFriends.filter(
		(friend) => props.friendPresence[friend.id],
	);
	const offlineFriends = sortedFriends.filter(
		(friend) => !props.friendPresence[friend.id],
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
							{onlineFriends.map((friend) => (
								<FriendRow
									key={friend.id}
									friend={friend}
									online
									onOpen={() =>
										void props.onSelectFriend(friend)
									}
									onRemove={() =>
										void props.onRemoveFriend(friend.id)
									}
								/>
							))}
							{onlineFriends.length > 0 &&
							offlineFriends.length > 0 ? (
								<div className="py-1" aria-hidden>
									<div className="border-t border-white/6" />
								</div>
							) : null}
							{offlineFriends.map((friend) => (
								<FriendRow
									key={friend.id}
									friend={friend}
									online={false}
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
	online: boolean;
	onOpen: () => void;
	onRemove: () => void;
}) {
	return (
		<div className="group flex items-stretch rounded-sm transition-colors hover:bg-white/3">
			<button
				type="button"
				className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left"
				onClick={props.onOpen}
				aria-label={`Open ${props.friend.nick} (${props.online ? 'online' : 'offline'})`}
			>
				<span
					aria-hidden
					className={cn(
						'size-2 shrink-0 rounded-full',
						props.online ? 'bg-emerald-400' : 'bg-zinc-500/70',
					)}
				/>
				<span
					className={cn(
						'truncate text-[13px]',
						props.online
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
