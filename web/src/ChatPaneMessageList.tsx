import {
	memo,
	useCallback,
	useLayoutEffect,
	useMemo,
	useRef,
	type RefObject,
	type UIEvent,
} from 'react';
import type {
	BufferState,
	ChannelUserState,
	ChatMessage,
} from '../../shared/protocol.js';
import { Button } from '@/components/ui/button.js';
import {
	captureUnreadDividerAnchor,
	resolveInitialTranscriptScrollTarget,
	resolveVisibleUnreadDividerIndex,
	type UnreadDividerAnchor,
} from './buffer-activity.js';
import { ChatPaneMessageBlock } from './ChatPaneMessageBlock.js';
import { TranscriptEmptyState } from './ChatPaneTranscriptDecorations.js';
import type { MessageDisplayMode } from './message-display-mode.js';
import type { MessageParticipantPresentation } from './message-participant-presentation.js';
import {
	buildChannelUserModesByNick,
	resolveParticipantHighlightMode,
} from './message-participant-presentation.js';
import { buildRenderBlocks } from './chat-pane-message-utils.js';
import {
	refreshStickyScrollMode,
	scrollNodeToBottom,
} from './useStickyScroll.js';

type ChatPaneMessageListProps = {
	selectedBuffer: BufferState | null;
	channelUsers?: ChannelUserState[];
	messages: ChatMessage[];
	scrollRef: RefObject<HTMLDivElement | null>;
	emptyBody: string;
	mode: MessageDisplayMode;
	listKind: 'chat' | 'server';
	canLoadOlderHistory?: boolean;
	loadingOlderHistory?: boolean;
	onOpenChannel: (channel: string) => void;
	onOpenParticipantQuery?: (nick: string) => void;
	onLoadOlderHistory?: () => Promise<void>;
};

export const ChatPaneMessageList = memo(function ChatPaneMessageList(
	props: ChatPaneMessageListProps,
) {
	const participantHighlightMode = resolveParticipantHighlightMode(
		props.selectedBuffer?.kind ?? null,
	);
	const unreadDividerAnchorRef = useRef<UnreadDividerAnchor | null>(null);
	const unreadDividerAnchor = captureUnreadDividerAnchor(
		props.selectedBuffer,
		unreadDividerAnchorRef.current,
	);
	unreadDividerAnchorRef.current = unreadDividerAnchor;
	const channelUserModesByNick = useMemo(
		() => buildChannelUserModesByNick(props.channelUsers),
		[props.channelUsers],
	);
	const firstUnreadDividerIndex = useMemo(
		() =>
			resolveVisibleUnreadDividerIndex(
				props.messages,
				props.selectedBuffer,
				unreadDividerAnchor,
			),
		[props.messages, props.selectedBuffer, unreadDividerAnchor],
	);
	const loadingOlderRef = useRef(false);
	const positionedBufferIdRef = useRef<string | null>(null);
	const unreadDividerRef = useRef<HTMLDivElement | null>(null);
	const renderBlocks = useMemo(
		() => buildRenderBlocks(props.messages, { listKind: props.listKind }),
		[props.listKind, props.messages],
	);
	const showLoadOlder = props.canLoadOlderHistory && props.onLoadOlderHistory;
	const initialScrollTarget = resolveInitialTranscriptScrollTarget({
		buffer: props.selectedBuffer,
		firstUnreadDividerIndex,
		listKind: props.listKind,
		messagesLength: props.messages.length,
	});
	const handleLoadOlder = useCallback(async () => {
		if (
			!props.onLoadOlderHistory ||
			loadingOlderRef.current ||
			props.loadingOlderHistory
		) {
			return;
		}
		loadingOlderRef.current = true;
		const scrollContainer = props.scrollRef.current;
		const previousHeight = scrollContainer?.scrollHeight ?? 0;
		const previousTop = scrollContainer?.scrollTop ?? 0;
		try {
			await props.onLoadOlderHistory();
			await waitForNextAnimationFrame();
			const nextScrollContainer = props.scrollRef.current;
			if (!nextScrollContainer) {
				return;
			}
			restoreScrollOffsetAfterPrepend(
				nextScrollContainer,
				previousHeight,
				previousTop,
			);
		} finally {
			loadingOlderRef.current = false;
		}
	}, [props.loadingOlderHistory, props.onLoadOlderHistory, props.scrollRef]);

	const handleScroll = useCallback(
		(event: UIEvent<HTMLDivElement>) => {
			if (
				!shouldAutoLoadOlderHistory({
					canLoadOlderHistory: !!showLoadOlder,
					loadingOlderHistory: props.loadingOlderHistory ?? false,
					loadingOlderInFlight: loadingOlderRef.current,
					scrollTop: event.currentTarget.scrollTop,
				})
			) {
				return;
			}
			void handleLoadOlder();
		},
		[handleLoadOlder, props.loadingOlderHistory, showLoadOlder],
	);

	useLayoutEffect(() => {
		const scrollContainer = props.scrollRef.current;
		const bufferId = props.selectedBuffer?.id ?? null;
		if (!scrollContainer || !bufferId) {
			positionedBufferIdRef.current = null;
			return;
		}
		if (
			positionedBufferIdRef.current === bufferId ||
			initialScrollTarget === 'wait'
		) {
			return;
		}
		if (
			initialScrollTarget === 'first-unread' &&
			unreadDividerRef.current
		) {
			unreadDividerRef.current.scrollIntoView({ block: 'start' });
		} else {
			scrollNodeToBottom(scrollContainer);
		}
		refreshStickyScrollMode(scrollContainer);
		positionedBufferIdRef.current = bufferId;
	}, [initialScrollTarget, props.scrollRef, props.selectedBuffer?.id]);

	return (
		<div
			ref={props.scrollRef}
			className="min-h-0 flex-1 overflow-y-auto px-4 py-4 pt-0"
			onScroll={handleScroll}
		>
			{showLoadOlder ? (
				<div
					className="mb-2 flex justify-center"
					data-scroll-anchor-item
				>
					<Button
						variant="outline"
						size="sm"
						disabled={props.loadingOlderHistory}
						onClick={() => void handleLoadOlder()}
					>
						{props.loadingOlderHistory
							? 'Loading older...'
							: 'Load older'}
					</Button>
				</div>
			) : null}
			{props.messages.length === 0 ? (
				<TranscriptEmptyState body={props.emptyBody} />
			) : (
				<div
					className="space-y-1.5 font-mono text-[12px]"
					data-scroll-anchor-item
				>
					{renderBlocks.map((block) => {
						return (
							<ChatPaneMessageBlock
								key={block.kind === 'day-divider' ? block.key : block.message.id}
								block={block}
								channelUserModesByNick={channelUserModesByNick}
								firstUnreadDividerIndex={firstUnreadDividerIndex}
								listKind={props.listKind}
								mode={props.mode}
								onOpenChannel={props.onOpenChannel}
								onOpenParticipantQuery={props.onOpenParticipantQuery}
								participantHighlightMode={participantHighlightMode}
								unreadDividerRef={unreadDividerRef}
							/>
						);
					})}
				</div>
			)}
			<div aria-hidden className="h-px w-full" data-scroll-anchor-end />
		</div>
	);
});

const waitForNextAnimationFrame = () =>
	new Promise<void>((resolve) => {
		window.requestAnimationFrame(() => resolve());
	});

const olderHistoryAutoLoadThresholdPx = 24;

export const shouldAutoLoadOlderHistory = (input: {
	canLoadOlderHistory: boolean;
	loadingOlderHistory: boolean;
	loadingOlderInFlight: boolean;
	scrollTop: number;
}) =>
	input.canLoadOlderHistory &&
	!input.loadingOlderHistory &&
	!input.loadingOlderInFlight &&
	input.scrollTop <= olderHistoryAutoLoadThresholdPx;

export const restoreScrollOffsetAfterPrepend = (
	node: Pick<HTMLDivElement, 'scrollHeight' | 'scrollTop'>,
	previousHeight: number,
	previousTop: number,
) => {
	node.scrollTop = previousTop + (node.scrollHeight - previousHeight);
};
