import type { ComponentType } from 'react';
import { X } from 'lucide-react';
import type { BufferState, PresenceStatus } from '../../shared/protocol-chat.js';
import { cn } from '@/lib/utils.js';
import { resolveBufferActivityState } from './transcript/unread-state.js';
import {
	connectionSidebarLabelClass,
	connectionSidebarRowClass,
} from './connection-sidebar-label-class.js';
import { resolveUserAvatarTarget } from './user-avatars/override-model.js';
import { useUserAvatarOverrideUrl } from './user-avatars/query-overrides.js';
import { UserAvatar } from './user-avatars/UserAvatar.js';

type BufferPresenceDisplay = PresenceStatus | 'pending';

type ConnectionSidebarBufferRowProps = {
	buffer: BufferState;
	dimmed: boolean;
	selected: boolean;
	icon: ComponentType<{ className?: string }>;
	presence: BufferPresenceDisplay | null;
	userAvatarsVisible?: boolean;
	emoji?: string | null;
	onSelect: () => void;
	onClose: () => void;
};

export function ConnectionSidebarBufferRow(
	props: ConnectionSidebarBufferRowProps,
) {
	const Icon = props.icon;
	const activity = resolveBufferActivityState(props.buffer);
	const avatarTarget = props.buffer.kind === 'query'
		? resolveUserAvatarTarget(props.buffer.networkId, {
				identity: props.buffer.peerIdentity,
				nick: props.buffer.target,
			})
		: null;
	const customAvatarUrl = useUserAvatarOverrideUrl(avatarTarget, {
		allowNickFallback: true,
		legacyBufferId: props.buffer.id,
	});
	const visibleCustomAvatarUrl =
		props.userAvatarsVisible === false ? null : customAvatarUrl;

	return (
		<div
			className={connectionSidebarRowClass(activity, {
				dimmed: props.dimmed,
				selected: props.selected,
			})}
		>
			<button
				className="flex min-w-0 flex-1 items-center gap-2 rounded-sm px-2 py-1.5 text-left outline-none focus-visible:ring-1 focus-visible:ring-primary/45"
				onClick={props.onSelect}
				aria-label={resolveBufferAriaLabel(
					props.buffer.target,
					props.presence,
					activity.hasUnread,
				)}
			>
				<span className="relative flex size-4 shrink-0 items-center justify-center">
					{visibleCustomAvatarUrl ? (
						<UserAvatar
							className="size-4"
							customAvatarUrl={visibleCustomAvatarUrl}
							enabled={false}
							user={{
								account: null,
								host: null,
								identity: props.buffer.peerIdentity,
								nick: props.buffer.target,
								username: null,
							}}
						/>
					) : (
						<Icon
							className={cn(
								'size-3.5 shrink-0',
								props.presence
									? presenceIconTone(props.presence)
									: 'text-muted-foreground',
							)}
						/>
					)}
					{activity.hasUnread ? (
						<span
							aria-hidden
							className={cn(
								'absolute -bottom-0.5 -right-0.5 rounded-full shadow-[0_0_0_2px_rgba(8,8,10,0.95)]',
								unreadBadgeTone(activity),
							)}
						/>
					) : null}
				</span>
				<span
					className={cn(
						connectionSidebarLabelClass(activity, {
							dimmed: props.dimmed,
							offline: props.presence === 'offline',
							selected: props.selected,
						}),
						'block min-w-0 flex-1',
					)}
				>
					{props.buffer.target}
					{props.emoji ? (
						<span className="ml-1 text-[12px] leading-none" aria-hidden>
							{props.emoji}
						</span>
					) : null}
				</span>
			</button>
			<button
				className="flex w-7 shrink-0 items-center justify-center rounded-sm text-muted-foreground opacity-0 transition-opacity duration-150 hover:bg-white/[0.06] hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/45 group-hover:opacity-100 group-focus-within:opacity-100"
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

const unreadBadgeTone = (activity: { priority: boolean }) =>
	activity.priority
		? 'size-2.5 bg-primary ring-2 ring-primary/25'
		: 'size-2 bg-primary/70';
