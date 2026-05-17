import { useEffect, useRef, useState } from 'react';
import { Check, MoreHorizontal } from 'lucide-react';
import type { PresenceStatus } from '../../shared/protocol-chat.js';
import { Button } from '@/components/ui/button.js';
import type { ConnectionSidebarProps } from './connection-sidebar-types.js';
import { FriendRow } from './ConnectionSidebarFriendRow.js';
import { resolveUniqueNickEmoji } from './nick-emoji-utils.js';

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
	const hideOfflineFriends = props.hideOfflineFriends ?? false;
	const variant = props.variant ?? 'bottom';
	const [menuOpen, setMenuOpen] = useState(false);
	const menuRef = useRef<HTMLDivElement | null>(null);
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

	useEffect(() => {
		if (!menuOpen) {
			return;
		}
		const handlePointerDown = (event: PointerEvent) => {
			if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
				setMenuOpen(false);
			}
		};
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				setMenuOpen(false);
			}
		};
		window.addEventListener('pointerdown', handlePointerDown);
		window.addEventListener('keydown', handleKeyDown);
		return () => {
			window.removeEventListener('pointerdown', handlePointerDown);
			window.removeEventListener('keydown', handleKeyDown);
		};
	}, [menuOpen]);

	return (
		<>
			<section
				className={
					variant === 'panel'
						? 'flex min-h-0 flex-1 flex-col px-2.5 py-1.5'
						: 'shrink-0 border-t border-white/8 px-2.5 py-1.5'
				}
			>
				<div className="flex items-center justify-between gap-2 px-1 py-0.5">
					<div className="min-w-0">
						<h2 className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground/75">
							Watchlist
						</h2>
					</div>
					<div ref={menuRef} className="relative shrink-0">
						<Button
							type="button"
							variant="ghost"
							size="icon"
							className="size-6 text-muted-foreground/75 hover:text-foreground"
							aria-label="Watchlist options"
							aria-expanded={menuOpen}
							aria-haspopup="menu"
							onClick={() => setMenuOpen((current) => !current)}
						>
							<MoreHorizontal className="size-4" />
						</Button>
						{menuOpen ? (
							<div
								role="menu"
								className="absolute right-0 top-full z-30 mt-1.5 min-w-44 overflow-hidden rounded-md border border-white/10 bg-popover p-1 shadow-[0_16px_40px_rgba(0,0,0,0.38)]"
							>
								<button
									type="button"
									role="menuitemcheckbox"
									aria-checked={hideOfflineFriends}
									className="flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-left text-[12px] text-foreground transition-colors hover:bg-white/[0.06]"
									onClick={() => {
										setMenuOpen(false);
										props.onToggleHideOfflineFriends?.();
									}}
								>
									<span>Hide offline nicks</span>
									{hideOfflineFriends ? (
										<Check className="size-3.5 text-primary" />
									) : null}
								</button>
							</div>
						) : null}
					</div>
				</div>
				<div
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
