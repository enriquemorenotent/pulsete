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
	const isQuery = props.buffer.kind === 'query';
	const unreadCount = Math.max(props.buffer.unread, props.buffer.priorityUnread);

	return (
		<div
			className={connectionSidebarRowClass(activity, {
				dimmed: props.dimmed,
				selected: props.selected,
				variant: 'selector',
			})}
		>
			<button
				className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-lg px-3 py-2 text-left outline-none focus-visible:ring-1 focus-visible:ring-primary/55"
				onClick={props.onSelect}
				aria-label={resolveBufferAriaLabel(
					props.buffer.target,
					props.presence,
					activity.hasUnread,
				)}
			>
				{isQuery ? (
					<UserAvatar
						className={cn(
							'size-8 rounded-lg text-[11px] font-semibold text-[#111318]',
							avatarTone(props.buffer.target),
						)}
						customAvatarUrl={visibleCustomAvatarUrl}
						enabled={props.userAvatarsVisible !== false}
						placeholder="initial"
						shape="square"
						user={{
							account: null,
							host: null,
							identity: props.buffer.peerIdentity,
							ircCloudAvatarId: props.buffer.ircCloudAvatarId,
							nick: props.buffer.target,
							username: null,
						}}
					/>
				) : (
					<span className="relative flex size-5 shrink-0 items-center justify-center">
						<Icon
							className={cn(
								'size-5 shrink-0',
								props.selected ? 'text-primary' : 'text-[#929aa5]',
							)}
						/>
					</span>
				)}
				<span
					className={cn(
						connectionSidebarLabelClass(activity, {
							dimmed: props.dimmed,
							offline: props.presence === 'offline',
							selected: props.selected,
						}),
						'block min-w-0 flex-1 text-[14px]',
					)}
				>
					{displayBufferTarget(props.buffer)}
					{props.emoji ? (
						<span className="ml-1 text-[12px] leading-none" aria-hidden>
							{props.emoji}
						</span>
					) : null}
				</span>
				{activity.hasUnread ? (
					<span className="inline-flex min-w-6 shrink-0 items-center justify-center rounded-full bg-[#3a414b] px-1.5 py-0.5 font-mono text-[11px] font-medium text-[#dce1e6]">
						{unreadCount}
					</span>
				) : null}
				{isQuery && props.presence && props.presence !== 'pending' ? (
					<span
						aria-hidden
						className={cn('size-2 shrink-0 rounded-full', presenceDotTone(props.presence))}
					/>
				) : null}
			</button>
			<button
				className="absolute right-1.5 top-1/2 z-10 flex size-7 -translate-y-1/2 items-center justify-center rounded-md bg-[#2a2d32] text-muted-foreground opacity-0 transition-opacity duration-150 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/45 group-hover:opacity-100 group-focus-within:opacity-100"
				onClick={props.onClose}
				aria-label={`Close ${props.buffer.target}`}
			>
				<X className="size-3" />
			</button>
		</div>
	);
}

const displayBufferTarget = (buffer: BufferState) =>
	buffer.kind === 'channel' ? buffer.target.replace(/^#/, '') : buffer.target;

const avatarTones = [
	'bg-[#f1a086]',
	'bg-[#e9c77f]',
	'bg-[#8fc8b9]',
	'bg-[#91add8]',
	'bg-[#b8a0cf]',
] as const;

const avatarTone = (nick: string) => {
	let hash = 0;
	for (const character of nick) {
		hash = (hash * 31 + character.charCodeAt(0)) | 0;
	}
	return avatarTones[Math.abs(hash) % avatarTones.length];
};

const presenceDotTone = (presence: BufferPresenceDisplay) => {
	if (presence === 'online') return 'bg-[#8cc9b7]';
	if (presence === 'away') return 'bg-[#e0bc68]';
	return 'bg-[#505762]';
};

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
