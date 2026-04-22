import {
	memo,
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
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
import {
	buildChannelUserModesByNick,
	resolveParticipantHighlightMode,
} from './message-participant-presentation.js';
import { buildRenderBlocks } from './chat-pane-message-utils.js';
import {
	isScrollNearBottom,
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
	initialHistoryPending?: boolean;
	loadingOlderHistory?: boolean;
	onOpenChannel: (channel: string) => void;
	onOpenParticipantQuery?: (nick: string) => void;
	onJumpToLatest?: () => void;
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
	const unreadDividerRef = useRef<HTMLDivElement | null>(null);
	const selectionPositionRef = useRef<ActiveSelectionPosition | null>(null);
	const selectionCorrectionRef = useRef<SelectionImageCorrection | null>(null);
	const selectionCorrectionCleanupRef = useRef<(() => void) | null>(null);
	const selectionCorrectionFrameRef = useRef<number | null>(null);
	const programmaticScrollRef = useRef<ProgrammaticScrollTransaction | null>(null);
	const programmaticScrollCleanupRef = useRef<number | null>(null);
	const programmaticScrollTokenRef = useRef(0);
	const [showJumpToLatest, setShowJumpToLatest] = useState(() =>
		shouldShowJumpToLatestControl({
			messagesLength: props.messages.length,
			scrollMetrics: props.scrollRef.current,
		}),
	);
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
	const syncJumpToLatestVisibility = useCallback(
		(scrollMetrics?: ScrollMetrics | null) => {
			setShowJumpToLatest(
				shouldShowJumpToLatestControl({
					messagesLength: props.messages.length,
					scrollMetrics: scrollMetrics ?? props.scrollRef.current,
				}),
			);
			},
		[props.messages.length, props.scrollRef],
	);
	const clearSelectionImageCorrection = useCallback(
		(bufferId?: string | null) => {
			const activeCorrection = selectionCorrectionRef.current;
			if (
				bufferId !== undefined &&
				activeCorrection &&
				activeCorrection.bufferId !== bufferId
			) {
				return;
			}
			if (
				typeof window !== 'undefined' &&
				selectionCorrectionFrameRef.current !== null
			) {
				window.cancelAnimationFrame(selectionCorrectionFrameRef.current);
				selectionCorrectionFrameRef.current = null;
			}
			selectionCorrectionCleanupRef.current?.();
			selectionCorrectionCleanupRef.current = null;
			selectionCorrectionRef.current = null;
		},
		[],
	);
	const clearProgrammaticScroll = useCallback((bufferId?: string | null) => {
		const activeTransaction = programmaticScrollRef.current;
		if (
			bufferId !== undefined &&
			activeTransaction &&
			activeTransaction.bufferId !== bufferId
		) {
			return;
		}
		if (
			typeof window !== 'undefined' &&
			programmaticScrollCleanupRef.current !== null
		) {
			window.cancelAnimationFrame(programmaticScrollCleanupRef.current);
			programmaticScrollCleanupRef.current = null;
		}
		programmaticScrollRef.current = null;
	}, []);
	const applyProgrammaticScroll = useCallback(
		(mutateScroll: (node: HTMLDivElement) => void) => {
			const scrollContainer = props.scrollRef.current;
			const bufferId = props.selectedBuffer?.id ?? null;
			if (!scrollContainer || !bufferId) {
				return false;
			}
			const token = programmaticScrollTokenRef.current + 1;
			programmaticScrollTokenRef.current = token;
			mutateScroll(scrollContainer);
			programmaticScrollRef.current = {
				bufferId,
				expectedScrollTop: scrollContainer.scrollTop,
				token,
			};
			if (typeof window !== 'undefined') {
				if (programmaticScrollCleanupRef.current !== null) {
					window.cancelAnimationFrame(programmaticScrollCleanupRef.current);
				}
				programmaticScrollCleanupRef.current = window.requestAnimationFrame(() => {
					programmaticScrollCleanupRef.current = null;
					programmaticScrollRef.current = expireProgrammaticScrollTransaction(
						programmaticScrollRef.current,
						token,
					);
				});
			}
			refreshStickyScrollMode(scrollContainer);
			syncJumpToLatestVisibility(scrollContainer);
			return true;
		},
		[props.scrollRef, props.selectedBuffer?.id, syncJumpToLatestVisibility],
	);
	const applySelectionImageCorrection = useCallback(() => {
		const activeCorrection = selectionCorrectionRef.current;
		const scrollContainer = props.scrollRef.current;
		if (
			!activeCorrection ||
			!scrollContainer ||
			activeCorrection.bufferId !== props.selectedBuffer?.id
		) {
			return;
		}
		if (activeCorrection.mode === 'bottom') {
			applyProgrammaticScroll((node) => {
				scrollNodeToBottom(node);
			});
		} else {
			const unreadDivider = unreadDividerRef.current;
			if (!unreadDivider) {
				return;
			}
			applyProgrammaticScroll((node) => {
				node.scrollTop = resolveElementViewportScrollTop(
					node,
					resolveElementTopInScrollContainer(node, unreadDivider),
					activeCorrection.targetOffsetPx,
				);
			});
		}
	}, [applyProgrammaticScroll, props.scrollRef, props.selectedBuffer?.id]);
	const scheduleSelectionImageCorrection = useCallback(() => {
		const activeCorrection = selectionCorrectionRef.current;
		if (
			typeof window === 'undefined' ||
			!activeCorrection ||
			selectionCorrectionFrameRef.current !== null
		) {
			return;
		}
		const correctionBufferId = activeCorrection.bufferId;
		selectionCorrectionFrameRef.current = window.requestAnimationFrame(() => {
			selectionCorrectionFrameRef.current = null;
			applySelectionImageCorrection();
			const currentCorrection = selectionCorrectionRef.current;
			if (
				currentCorrection?.bufferId === correctionBufferId &&
				currentCorrection.remainingImages <= 0
			) {
				clearSelectionImageCorrection(correctionBufferId);
			}
		});
	}, [applySelectionImageCorrection, clearSelectionImageCorrection]);
	const beginSelectionImageCorrection = useCallback(
		(mode: SelectionPositionMode) => {
			clearSelectionImageCorrection();
			const bufferId = props.selectedBuffer?.id ?? null;
			const scrollContainer = props.scrollRef.current;
			if (
				!bufferId ||
				!scrollContainer ||
				mode === 'wait'
			) {
				return;
			}
			const pendingImages = collectIncompleteTranscriptImages(scrollContainer);
			if (pendingImages.length === 0) {
				return;
			}
			selectionCorrectionRef.current = {
				bufferId,
				mode: mode === 'first-unread' ? 'unread' : 'bottom',
				targetOffsetPx:
					mode === 'first-unread'
						? resolveUnreadViewportOffset(scrollContainer)
						: 0,
				remainingImages: pendingImages.length,
			};
			const cleanupCallbacks = pendingImages.map((image) => {
				const handleLoad = () => {
					const activeCorrection = selectionCorrectionRef.current;
					if (!activeCorrection || activeCorrection.bufferId !== bufferId) {
						return;
					}
					activeCorrection.remainingImages -= 1;
					scheduleSelectionImageCorrection();
				};
				const handleError = () => {
					const activeCorrection = selectionCorrectionRef.current;
					if (!activeCorrection || activeCorrection.bufferId !== bufferId) {
						return;
					}
					activeCorrection.remainingImages -= 1;
					if (activeCorrection.remainingImages <= 0) {
						clearSelectionImageCorrection(bufferId);
					}
				};
				image.addEventListener('load', handleLoad, { once: true });
				image.addEventListener('error', handleError, { once: true });
				return () => {
					image.removeEventListener('load', handleLoad);
					image.removeEventListener('error', handleError);
				};
			});
			selectionCorrectionCleanupRef.current = () => {
				for (const cleanup of cleanupCallbacks) {
					cleanup();
				}
			};
		},
		[
			clearSelectionImageCorrection,
			props.scrollRef,
			props.selectedBuffer?.id,
			scheduleSelectionImageCorrection,
		],
	);
	const applySelectionPosition = useCallback(
		(mode: SelectionPositionMode) => {
			const scrollContainer = props.scrollRef.current;
			if (!scrollContainer || mode === 'wait') {
				return false;
			}
			if (mode === 'first-unread') {
				const unreadDivider = unreadDividerRef.current;
				if (!unreadDivider) {
					return false;
				}
				if (!applyProgrammaticScroll((node) => {
					node.scrollTop = resolveElementViewportScrollTop(
						node,
						resolveElementTopInScrollContainer(node, unreadDivider),
						resolveUnreadViewportOffset(node),
					);
				})) {
					return false;
				}
			} else {
				if (!applyProgrammaticScroll((node) => {
					scrollNodeToBottom(node);
				})) {
					return false;
				}
			}
			beginSelectionImageCorrection(mode);
			return true;
		},
		[
			applyProgrammaticScroll,
			beginSelectionImageCorrection,
		],
	);
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
			applyProgrammaticScroll((node) => {
				restoreScrollOffsetAfterPrepend(
					node,
					previousHeight,
					previousTop,
				);
			});
		} finally {
			loadingOlderRef.current = false;
		}
	}, [
		applyProgrammaticScroll,
		props.loadingOlderHistory,
		props.onLoadOlderHistory,
		props.scrollRef,
	]);

	const handleScroll = useCallback(
		(event: UIEvent<HTMLDivElement>) => {
			syncJumpToLatestVisibility(event.currentTarget);
			const bufferId = props.selectedBuffer?.id ?? null;
			if (isProgrammaticScrollEvent({
				activeTransaction: programmaticScrollRef.current,
				bufferId,
				scrollTop: event.currentTarget.scrollTop,
			})) {
				return;
			}
			clearProgrammaticScroll(bufferId);
			clearSelectionImageCorrection(bufferId);
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
		[
			clearProgrammaticScroll,
			clearSelectionImageCorrection,
			handleLoadOlder,
			props.loadingOlderHistory,
			props.selectedBuffer?.id,
			showLoadOlder,
			syncJumpToLatestVisibility,
		],
	);
	const handleJumpToLatest = useCallback(() => {
		clearSelectionImageCorrection(props.selectedBuffer?.id ?? null);
		props.onJumpToLatest?.();
		setShowJumpToLatest(false);
	}, [clearSelectionImageCorrection, props.onJumpToLatest, props.selectedBuffer?.id]);

	useEffect(() => {
		return () => {
			clearSelectionImageCorrection();
			clearProgrammaticScroll();
		};
	}, [clearProgrammaticScroll, clearSelectionImageCorrection]);

	useEffect(() => {
		const bufferId = props.selectedBuffer?.id ?? null;
		if (!bufferId) {
			selectionPositionRef.current = null;
			clearSelectionImageCorrection();
			clearProgrammaticScroll();
			setShowJumpToLatest(false);
			return;
		}
		return () => {
			clearSelectionImageCorrection(bufferId);
			clearProgrammaticScroll(bufferId);
		};
	}, [clearProgrammaticScroll, clearSelectionImageCorrection, props.selectedBuffer?.id]);

	useLayoutEffect(() => {
		const scrollContainer = props.scrollRef.current;
		const bufferId = props.selectedBuffer?.id ?? null;
		if (!scrollContainer || !bufferId) {
			return;
		}
		let selectionPosition = selectionPositionRef.current;
		if (!selectionPosition || selectionPosition.bufferId !== bufferId) {
			selectionPosition = { bufferId, positioned: false };
			selectionPositionRef.current = selectionPosition;
		}
		if (selectionPosition.positioned) {
			syncJumpToLatestVisibility(scrollContainer);
			return;
		}
		const selectionMode = resolveSelectionPositionMode({
			initialHistoryPending: props.initialHistoryPending ?? false,
			initialScrollTarget,
		});
		if (selectionMode === 'wait') {
			syncJumpToLatestVisibility(scrollContainer);
			return;
		}
		if (applySelectionPosition(selectionMode)) {
			selectionPosition.positioned = true;
		}
		syncJumpToLatestVisibility(scrollContainer);
	}, [
		applySelectionPosition,
		initialScrollTarget,
		props.initialHistoryPending,
		props.scrollRef,
		props.selectedBuffer?.id,
		syncJumpToLatestVisibility,
	]);

	return (
		<div className="relative min-h-0 flex-1">
			<div
				ref={props.scrollRef}
				className="h-full overflow-y-auto px-4 py-4 pt-0"
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
			{props.onJumpToLatest && showJumpToLatest ? (
				<div className="pointer-events-none absolute inset-x-0 bottom-4 z-20 flex justify-center px-4">
					<Button
						variant="outline"
						size="sm"
						className="pointer-events-auto rounded-full border-white/12 bg-[#2b303a]/88 px-3.5 text-[12px] text-foreground shadow-[0_14px_32px_rgba(0,0,0,0.36)] backdrop-blur-xl hover:bg-[#333845]/92"
						onClick={handleJumpToLatest}
					>
						Jump to latest
					</Button>
				</div>
			) : null}
		</div>
	);
});

const waitForNextAnimationFrame = () =>
	new Promise<void>((resolve) => {
		window.requestAnimationFrame(() => resolve());
	});

const olderHistoryAutoLoadThresholdPx = 24;

type ScrollMetrics = Pick<HTMLDivElement, 'clientHeight' | 'scrollHeight' | 'scrollTop'>;

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

export const shouldShowJumpToLatestControl = (input: {
	messagesLength: number;
	scrollMetrics?: ScrollMetrics | null;
}) =>
	input.messagesLength > 0 &&
	!!input.scrollMetrics &&
	!isScrollNearBottom(input.scrollMetrics);

export const restoreScrollOffsetAfterPrepend = (
	node: Pick<HTMLDivElement, 'scrollHeight' | 'scrollTop'>,
	previousHeight: number,
	previousTop: number,
) => {
	node.scrollTop = previousTop + (node.scrollHeight - previousHeight);
};

const unreadViewportOffsetRatio = 0.25;
const programmaticScrollTolerancePx = 1;

type SelectionPositionMode = 'wait' | 'first-unread' | 'bottom';

type ActiveSelectionPosition = {
	bufferId: string;
	positioned: boolean;
};

type ProgrammaticScrollTransaction = {
	bufferId: string;
	expectedScrollTop: number;
	token: number;
};

type SelectionImageCorrection = {
	bufferId: string;
	mode: 'bottom' | 'unread';
	targetOffsetPx: number;
	remainingImages: number;
};

export const resolveSelectionPositionMode = (input: {
	initialHistoryPending: boolean;
	initialScrollTarget: ReturnType<typeof resolveInitialTranscriptScrollTarget>;
}): SelectionPositionMode => {
	if (input.initialScrollTarget === 'wait') {
		return input.initialHistoryPending ? 'wait' : 'bottom';
	}
	return input.initialScrollTarget === 'first-unread'
		? 'first-unread'
		: 'bottom';
};

export const resolveUnreadViewportOffset = (
	scrollMetrics: Pick<HTMLDivElement, 'clientHeight'>,
) => Math.round(scrollMetrics.clientHeight * unreadViewportOffsetRatio);

export const resolveElementViewportScrollTop = (
	scrollMetrics: Pick<HTMLDivElement, 'clientHeight' | 'scrollHeight'>,
	elementTop: number,
	viewportOffsetPx: number,
) => clampScrollTop(
	elementTop - viewportOffsetPx,
	scrollMetrics.scrollHeight - scrollMetrics.clientHeight,
);

const resolveElementTopInScrollContainer = (
	scrollContainer: Pick<HTMLDivElement, 'getBoundingClientRect' | 'scrollTop'>,
	element: Pick<HTMLElement, 'getBoundingClientRect'>,
) => {
	const containerRect = scrollContainer.getBoundingClientRect();
	const elementRect = element.getBoundingClientRect();
	return elementRect.top - containerRect.top + scrollContainer.scrollTop;
};

const collectIncompleteTranscriptImages = (
	scrollContainer: HTMLDivElement,
) => Array.from(scrollContainer.querySelectorAll<HTMLImageElement>('img'))
	.filter((image) => !image.complete);

const clampScrollTop = (scrollTop: number, maxScrollTop: number) =>
	Math.max(0, Math.min(Math.round(scrollTop), Math.max(0, maxScrollTop)));

export const isProgrammaticScrollEvent = (input: {
	activeTransaction: Pick<
		ProgrammaticScrollTransaction,
		'bufferId' | 'expectedScrollTop'
	> | null;
	bufferId: string | null;
	scrollTop: number;
	tolerancePx?: number;
}) =>
	!!input.activeTransaction &&
	!!input.bufferId &&
	input.activeTransaction.bufferId === input.bufferId &&
	Math.abs(input.activeTransaction.expectedScrollTop - input.scrollTop)
		<= (input.tolerancePx ?? programmaticScrollTolerancePx);

export const expireProgrammaticScrollTransaction = (
	activeTransaction: ProgrammaticScrollTransaction | null,
	token: number,
) => activeTransaction?.token === token ? null : activeTransaction;
