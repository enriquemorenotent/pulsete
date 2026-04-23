import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { GroupedVirtuosoHandle } from 'react-virtuoso';

const firstItemIndexBase = 1_000_000;
const unreadViewportOffsetRatio = 0.25;

type ScrollBehavior = 'auto' | false;
type ScrollTarget = 'bottom' | 'first-unread' | 'wait';

type UseChatTranscriptViewportParams = {
  bufferId: string | null;
  followOutputRequestId: number;
  initialScrollTarget: ScrollTarget;
  initialHistoryPending: boolean;
  loadingOlderHistory: boolean;
  onLoadOlderHistory?: () => Promise<number>;
  totalItemCount: number;
  unreadRowIndex: number | null;
};

export function useChatTranscriptViewport(params: UseChatTranscriptViewportParams) {
  const virtuosoRef = useRef<GroupedVirtuosoHandle | null>(null);
  const scrollerRef = useRef<HTMLElement | null>(null);
  const loadingOlderRef = useRef(false);
  const pendingSendFollowRef = useRef(false);
  const previousFollowOutputRequestIdRef = useRef(params.followOutputRequestId);
  const positionedBufferIdRef = useRef<string | null>(null);
  const [firstItemIndex, setFirstItemIndex] = useState(firstItemIndexBase);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const [atBottom, setAtBottom] = useState(true);

  useEffect(() => {
    if (params.followOutputRequestId === previousFollowOutputRequestIdRef.current) {
      return;
    }
    previousFollowOutputRequestIdRef.current = params.followOutputRequestId;
    pendingSendFollowRef.current = true;
  }, [params.followOutputRequestId]);

  useEffect(() => {
    positionedBufferIdRef.current = null;
    loadingOlderRef.current = false;
    pendingSendFollowRef.current = false;
    setAtBottom(true);
    setFirstItemIndex(firstItemIndexBase);
    setShowJumpToLatest(false);
  }, [params.bufferId]);

  useLayoutEffect(() => {
    if (
      !params.bufferId
      || params.initialHistoryPending
      || params.totalItemCount === 0
      || positionedBufferIdRef.current === params.bufferId
    ) {
      return;
    }

    if (params.initialScrollTarget === 'wait') {
      return;
    }

    if (params.initialScrollTarget === 'first-unread' && params.unreadRowIndex !== null) {
      virtuosoRef.current?.scrollToIndex(
        resolveUnreadScrollLocation(
          params.unreadRowIndex,
          scrollerRef.current?.clientHeight ?? 0,
        ),
      );
    } else {
      virtuosoRef.current?.scrollToIndex({
        align: 'end',
        behavior: 'auto',
        index: 'LAST',
      });
    }

    positionedBufferIdRef.current = params.bufferId;
  }, [
    params.bufferId,
    params.initialHistoryPending,
    params.initialScrollTarget,
    params.totalItemCount,
    params.unreadRowIndex,
  ]);

  const loadOlderHistory = useCallback(async () => {
    if (
      !params.onLoadOlderHistory
      || loadingOlderRef.current
      || params.loadingOlderHistory
    ) {
      return;
    }

    loadingOlderRef.current = true;
    try {
      const prependedCount = await params.onLoadOlderHistory();
      if (prependedCount > 0) {
        setFirstItemIndex((current) =>
          resolveNextFirstItemIndex(current, prependedCount),
        );
      }
    } finally {
      loadingOlderRef.current = false;
    }
  }, [params.loadingOlderHistory, params.onLoadOlderHistory]);

  const followOutput = useCallback(
    (isAtBottom: boolean): ScrollBehavior => {
      const behavior = resolveTranscriptFollowOutput({
        isAtBottom,
        pendingSendFollow: pendingSendFollowRef.current,
      });
      if (pendingSendFollowRef.current && behavior !== false) {
        pendingSendFollowRef.current = false;
      }
      return behavior;
    },
    [],
  );

  const handleAtBottomStateChange = useCallback(
    (nextAtBottom: boolean) => {
      setAtBottom(nextAtBottom);
      setShowJumpToLatest(params.totalItemCount > 0 && !nextAtBottom);
    },
    [params.totalItemCount],
  );

  const handleInlinePreviewLoad = useCallback(() => {
    if (atBottom || pendingSendFollowRef.current) {
      virtuosoRef.current?.autoscrollToBottom();
    }
  }, [atBottom]);

  const handleJumpToLatest = useCallback(() => {
    pendingSendFollowRef.current = false;
    virtuosoRef.current?.scrollToIndex({
      align: 'end',
      behavior: 'auto',
      index: 'LAST',
    });
  }, []);

  const setScrollerNode = useCallback((node: HTMLElement | null | Window) => {
    scrollerRef.current = node instanceof HTMLElement ? node : null;
  }, []);

  return {
    firstItemIndex,
    followOutput,
    handleAtBottomStateChange,
    handleInlinePreviewLoad,
    handleJumpToLatest,
    loadOlderHistory,
    scrollerRef: setScrollerNode,
    showJumpToLatest,
    startReached: () => void loadOlderHistory(),
    virtuosoRef,
  };
}

export const resolveTranscriptFollowOutput = (input: {
  isAtBottom: boolean;
  pendingSendFollow: boolean;
}): ScrollBehavior =>
  input.pendingSendFollow || input.isAtBottom ? 'auto' : false;

export const resolveNextFirstItemIndex = (
  currentFirstItemIndex: number,
  prependedItemCount: number,
) => Math.max(1, currentFirstItemIndex - Math.max(0, prependedItemCount));

export const resolveUnreadScrollLocation = (
  unreadRowIndex: number,
  scrollerHeight: number,
) => ({
  align: 'start' as const,
  behavior: 'auto' as const,
  index: unreadRowIndex,
  offset: -Math.round(scrollerHeight * unreadViewportOffsetRatio),
});
