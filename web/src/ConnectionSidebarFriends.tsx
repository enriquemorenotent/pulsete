import { useId, useState } from 'react';
import { ChevronRight, Eye, EyeOff } from 'lucide-react';
import type { PresenceStatus } from '../../shared/protocol-chat.js';
import { Button } from '@/components/ui/button.js';
import type { ConnectionSidebarProps } from './connection-sidebar-types.js';
import { FriendRow } from './ConnectionSidebarFriendRow.js';
import { resolveUniqueNickEmoji } from './nick-emoji-utils.js';
import { cn } from '@/lib/utils.js';

type ConnectionSidebarFriendsProps = Pick<
	ConnectionSidebarProps,
	| 'friends'
	| 'friendPresence'
	| 'hideOfflineFriends'
	| 'nickEmojis'
	| 'onRemoveFriend'
	| 'onSelectFriend'
	| 'onToggleHideOfflineFriends'
> & {
	variant?: 'bottom' | 'panel';
};

export function ConnectionSidebarFriends(props: ConnectionSidebarFriendsProps) {
	const contentId = useId();
	const [expandedOverride, setExpandedOverride] = useState<boolean | null>(null);
	const hideOfflineFriends = props.hideOfflineFriends ?? false;
	const variant = props.variant ?? 'bottom';
	const offlineVisibilityLabel = hideOfflineFriends
		? 'Show offline nicks'
		: 'Hide offline nicks';
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
	const visibleFriends = hideOfflineFriends
		? activeFriends
		: [...activeFriends, ...offlineFriends];
	const expanded = expandedOverride ?? (variant === 'panel' || visibleFriends.length > 0);

	return (
		<>
			<section
				className={
					variant === 'panel'
						? 'flex min-h-0 flex-1 flex-col px-2.5 py-1.5'
						: 'shrink-0 border-t border-white/5 px-2.5 py-2'
				}
			>
				<div className="flex items-center justify-between gap-2 px-1 py-0.5">
					<h2 className="min-w-0 flex-1">
						<button
							type="button"
							className="flex w-full items-center gap-1.5 rounded-sm py-1 text-left text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground/75 outline-none hover:text-foreground focus-visible:ring-1 focus-visible:ring-primary/45"
							aria-expanded={expanded}
							aria-controls={contentId}
							aria-label={`${expanded ? 'Collapse' : 'Expand'} watchlist`}
							onClick={() => setExpandedOverride(!expanded)}
						>
							<ChevronRight aria-hidden className={cn('size-3 shrink-0', expanded && 'rotate-90')} />
							<span>Watchlist</span>
							<span className="ml-1 font-normal tabular-nums tracking-normal text-muted-foreground/55" title={`${activeFriends.length} active`}>{activeFriends.length}</span>
						</button>
					</h2>
					<Button
						type="button"
						variant="ghost"
						size="icon"
						className="size-6 shrink-0 text-muted-foreground/75 hover:text-foreground"
						aria-label={offlineVisibilityLabel}
						aria-pressed={hideOfflineFriends}
						title={offlineVisibilityLabel}
						onClick={props.onToggleHideOfflineFriends}
					>
						{hideOfflineFriends ? (
							<Eye className="size-4" />
						) : (
							<EyeOff className="size-4" />
						)}
					</Button>
				</div>
				<div
					id={contentId}
					hidden={!expanded}
					className={
						variant === 'panel'
							? 'mt-0.5 min-h-0 flex-1 overflow-y-auto overscroll-contain pr-0.5'
							: 'mt-0.5 max-h-[min(28dvh,14rem)] overflow-y-auto overscroll-contain pr-0.5'
					}
				>
					{props.friends.length === 0 ? (
						<div className="px-2 py-1 text-[12px] text-muted-foreground/70">
							No watched nicks yet.
						</div>
					) : visibleFriends.length === 0 ? (
						<div className="px-2 py-1 text-[12px] text-muted-foreground/70">
							No watched nicks are online right now.
						</div>
					) : (
						<div className="space-y-0.5 border-white/6">
							{visibleFriends.map((friend) => (
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
									emoji={resolveUniqueNickEmoji(props.nickEmojis, friend.nick)}
								/>
							))}
						</div>
					)}
				</div>
			</section>
		</>
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
