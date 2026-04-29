import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { GroupedVirtuosoHandle } from 'react-virtuoso';

const firstItemIndexBase = 1_000_000;
const unreadViewportOffsetRatio = 0.25;

type ScrollBehavior = 'auto' | false;
export type TranscriptInitialScrollTarget = 'latest' | 'first-unread' | 'wait';

type UseChatTranscriptViewportParams = {
  bufferId: string | null;
  followOutputRequestId: number;
  initialScrollTarget: TranscriptInitialScrollTarget;
  initialHistoryPending: boolean;
  loadingOlderHistory: boolean;
  onLoadOlderHistory?: () => Promise<number>;
  rowKeys: readonly string[];
  totalItemCount: number;
  unreadRowIndex: number | null;
};

export function useChatTranscriptViewport(params: UseChatTranscriptViewportParams) {
  const virtuosoRef = useRef<GroupedVirtuosoHandle | null>(null);
  const scrollerRef = useRef<HTMLElement | null>(null);
  const loadingOlderRef = useRef(false);
  const pendingSendToLatestRef = useRef(false);
  const pendingOlderHistoryAnchorKeyRef = useRef<string | null>(null);
  const previousFollowOutputRequestIdRef = useRef(params.followOutputRequestId);
  const positionedBufferIdRef = useRef<string | null>(null);
  const [firstItemIndex, setFirstItemIndex] = useState(firstItemIndexBase);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const [isPinnedToLatest, setIsPinnedToLatest] = useState(true);

  useEffect(() => {
    if (params.followOutputRequestId === previousFollowOutputRequestIdRef.current) {
      return;
    }
    previousFollowOutputRequestIdRef.current = params.followOutputRequestId;
    pendingSendToLatestRef.current = true;
  }, [params.followOutputRequestId]);

  useEffect(() => {
    positionedBufferIdRef.current = null;
    loadingOlderRef.current = false;
    pendingOlderHistoryAnchorKeyRef.current = null;
    pendingSendToLatestRef.current = false;
    setIsPinnedToLatest(true);
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
        resolveFirstUnreadScrollLocation(
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

  useLayoutEffect(() => {
    const anchorKey = pendingOlderHistoryAnchorKeyRef.current;
    if (!anchorKey) {
      return;
    }

    const prependedRowCount = resolvePrependedRowCountFromAnchor(
      anchorKey,
      params.rowKeys,
    );
    if (prependedRowCount !== null && prependedRowCount > 0) {
      setFirstItemIndex((current) =>
        resolveNextFirstItemIndex(current, prependedRowCount),
      );
      pendingOlderHistoryAnchorKeyRef.current = null;
      return;
    }

    if (!params.loadingOlderHistory) {
      pendingOlderHistoryAnchorKeyRef.current = null;
    }
  }, [params.loadingOlderHistory, params.rowKeys]);

  const handleLoadOlderHistory = useCallback(async () => {
    if (
      !params.onLoadOlderHistory
      || loadingOlderRef.current
      || params.loadingOlderHistory
    ) {
      return;
    }

    loadingOlderRef.current = true;
    pendingOlderHistoryAnchorKeyRef.current = params.rowKeys[0] ?? null;
    try {
      const loadedMessageCount = await params.onLoadOlderHistory();
      if (loadedMessageCount <= 0) {
        pendingOlderHistoryAnchorKeyRef.current = null;
      }
      return loadedMessageCount;
    } catch {
      pendingOlderHistoryAnchorKeyRef.current = null;
      return 0;
    } finally {
      loadingOlderRef.current = false;
    }
  }, [params.loadingOlderHistory, params.onLoadOlderHistory, params.rowKeys]);

  const followOutput = useCallback(
    (atLatest: boolean): ScrollBehavior => {
      const behavior = resolveLatestFollowBehavior({
        atLatest,
        pendingSendToLatest: pendingSendToLatestRef.current,
      });
      if (pendingSendToLatestRef.current && behavior !== false) {
        pendingSendToLatestRef.current = false;
      }
      return behavior;
    },
    [],
  );

  const handleAtBottomStateChange = useCallback(
    (nextAtBottom: boolean) => {
      setIsPinnedToLatest(nextAtBottom);
      setShowJumpToLatest(params.totalItemCount > 0 && !nextAtBottom);
    },
    [params.totalItemCount],
  );

  const handleInlinePreviewLoad = useCallback(() => {
    if (isPinnedToLatest || pendingSendToLatestRef.current) {
      virtuosoRef.current?.autoscrollToBottom();
    }
  }, [isPinnedToLatest]);

  const handleJumpToLatest = useCallback(() => {
    pendingSendToLatestRef.current = false;
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
    handleLoadOlderHistory,
    scrollerRef: setScrollerNode,
    showJumpToLatest,
    virtuosoRef,
  };
}

export const resolveLatestFollowBehavior = (input: {
  atLatest: boolean;
  pendingSendToLatest: boolean;
}): ScrollBehavior =>
  input.pendingSendToLatest || input.atLatest ? 'auto' : false;

export const resolveNextFirstItemIndex = (
  currentFirstItemIndex: number,
  prependedRowCount: number,
) => Math.max(1, currentFirstItemIndex - Math.max(0, prependedRowCount));

export const resolvePrependedRowCountFromAnchor = (
  previousFirstRowKey: string,
  rowKeys: readonly string[],
) => {
  const anchorIndex = rowKeys.indexOf(previousFirstRowKey);
  return anchorIndex >= 0 ? anchorIndex : null;
};

export const resolveFirstUnreadScrollLocation = (
  unreadRowIndex: number,
  scrollerHeight: number,
) => ({
  align: 'start' as const,
  behavior: 'auto' as const,
  index: unreadRowIndex,
  offset: -Math.round(scrollerHeight * unreadViewportOffsetRatio),
});
