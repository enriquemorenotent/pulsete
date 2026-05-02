import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { GroupedVirtuosoHandle, ListItem } from 'react-virtuoso';

const firstItemIndexBase = 1_000_000;
const topAutoLoadThreshold = 240;
const unreadViewportOffsetRatio = 0.25;

type ScrollBehavior = 'auto' | false;
export type TranscriptInitialScrollTarget = 'latest' | 'first-unread' | 'wait';

export type TranscriptScrollSnapshot =
  | { kind: 'latest' }
  | { kind: 'anchor'; rowKey: string };

type UseTranscriptViewportParams = {
  bufferId: string | null;
  followOutputRequestId: number;
  initialHistoryPending: boolean;
  initialScrollTarget: TranscriptInitialScrollTarget;
  loadingOlderHistory: boolean;
  onLoadOlderHistory?: () => Promise<number>;
  rowKeys: readonly string[];
  totalItemCount: number;
  unreadRowIndex: number | null;
};

export function useTranscriptViewport(params: UseTranscriptViewportParams) {
  const virtuosoRef = useRef<GroupedVirtuosoHandle | null>(null);
  const scrollerRef = useRef<HTMLElement | null>(null);
  const currentBufferIdRef = useRef<string | null>(null);
  const firstItemIndexRef = useRef(firstItemIndexBase);
  const isPinnedToLatestRef = useRef(true);
  const loadingOlderRef = useRef(false);
  const pendingSendToLatestRef = useRef(false);
  const pendingOlderHistoryAnchorKeyRef = useRef<string | null>(null);
  const positionedBufferIdRef = useRef<string | null>(null);
  const previousFollowOutputRequestIdRef = useRef(params.followOutputRequestId);
  const scrollSnapshotsRef = useRef(new Map<string, TranscriptScrollSnapshot>());
  const visibleAnchorRowKeyRef = useRef<string | null>(null);
  const [firstItemIndex, setFirstItemIndexValue] = useState(firstItemIndexBase);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const [isPinnedToLatest, setIsPinnedToLatest] = useState(true);

  const setFirstItemIndex = useCallback((value: number | ((current: number) => number)) => {
    setFirstItemIndexValue((current) => {
      const next = typeof value === 'function' ? value(current) : value;
      firstItemIndexRef.current = next;
      return next;
    });
  }, []);

  const saveBufferScrollSnapshot = useCallback((bufferId: string | null) => {
    if (!bufferId || positionedBufferIdRef.current !== bufferId) {
      return;
    }
    if (isPinnedToLatestRef.current) {
      scrollSnapshotsRef.current.set(bufferId, { kind: 'latest' });
      return;
    }
    const rowKey = visibleAnchorRowKeyRef.current;
    if (rowKey) {
      scrollSnapshotsRef.current.set(bufferId, { kind: 'anchor', rowKey });
    }
  }, []);

  useEffect(() => {
    if (params.followOutputRequestId === previousFollowOutputRequestIdRef.current) {
      return;
    }
    previousFollowOutputRequestIdRef.current = params.followOutputRequestId;
    pendingSendToLatestRef.current = true;
  }, [params.followOutputRequestId]);

  useLayoutEffect(() => {
    if (currentBufferIdRef.current === params.bufferId) {
      return;
    }
    saveBufferScrollSnapshot(currentBufferIdRef.current);
    currentBufferIdRef.current = params.bufferId;
    firstItemIndexRef.current = firstItemIndexBase;
    isPinnedToLatestRef.current = true;
    loadingOlderRef.current = false;
    pendingOlderHistoryAnchorKeyRef.current = null;
    pendingSendToLatestRef.current = false;
    positionedBufferIdRef.current = null;
    visibleAnchorRowKeyRef.current = null;
    setFirstItemIndex(firstItemIndexBase);
    setIsPinnedToLatest(true);
    setShowJumpToLatest(false);
  }, [params.bufferId, saveBufferScrollSnapshot, setFirstItemIndex]);

  useEffect(
    () => () => saveBufferScrollSnapshot(currentBufferIdRef.current),
    [saveBufferScrollSnapshot],
  );

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

    const restored = resolveRestoredTranscriptScrollIndex({
      firstItemIndex: firstItemIndexRef.current,
      rowKeys: params.rowKeys,
      snapshot: scrollSnapshotsRef.current.get(params.bufferId) ?? null,
    });
    if (restored !== null) {
      virtuosoRef.current?.scrollToIndex(restored);
      positionedBufferIdRef.current = params.bufferId;
      return;
    }

    if (params.initialScrollTarget === 'first-unread' && params.unreadRowIndex !== null) {
      virtuosoRef.current?.scrollToIndex(
        resolveFirstUnreadScrollLocation(
          firstItemIndexRef.current + params.unreadRowIndex,
          scrollerRef.current?.clientHeight ?? 0,
        ),
      );
    } else {
      scrollToLatest(virtuosoRef.current);
    }

    positionedBufferIdRef.current = params.bufferId;
  }, [
    params.bufferId,
    params.initialHistoryPending,
    params.initialScrollTarget,
    params.rowKeys,
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
  }, [params.loadingOlderHistory, params.rowKeys, setFirstItemIndex]);

  const handleLoadOlderHistory = useCallback(async () => {
    if (
      !params.onLoadOlderHistory
      || loadingOlderRef.current
      || params.loadingOlderHistory
      || pendingOlderHistoryAnchorKeyRef.current
    ) {
      return 0;
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

  const handleAtTopStateChange = useCallback(
    (atTop: boolean) => {
      if (
        atTop
        && params.bufferId
        && positionedBufferIdRef.current === params.bufferId
        && !params.initialHistoryPending
      ) {
        void handleLoadOlderHistory();
      }
    },
    [handleLoadOlderHistory, params.bufferId, params.initialHistoryPending],
  );

  const handleStartReached = useCallback(
    () => {
      if (
        params.bufferId
        && positionedBufferIdRef.current === params.bufferId
        && !params.initialHistoryPending
      ) {
        void handleLoadOlderHistory();
      }
    },
    [handleLoadOlderHistory, params.bufferId, params.initialHistoryPending],
  );

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
      isPinnedToLatestRef.current = nextAtBottom;
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

  const handleItemsRendered = useCallback(
    (items: ListItem<unknown>[]) => {
      const firstRecordItem = items.find((item) => item.type !== 'group') ?? null;
      visibleAnchorRowKeyRef.current = firstRecordItem
        ? resolveRowKeyFromItemIndex(firstRecordItem.index, params.rowKeys, firstItemIndexRef.current)
        : null;
    },
    [params.rowKeys],
  );

  const handleJumpToLatest = useCallback(() => {
    pendingSendToLatestRef.current = false;
    isPinnedToLatestRef.current = true;
    setIsPinnedToLatest(true);
    setShowJumpToLatest(false);
    scrollToLatest(virtuosoRef.current);
  }, []);

  const setScrollerNode = useCallback((node: HTMLElement | null | Window) => {
    scrollerRef.current = node instanceof HTMLElement ? node : null;
  }, []);

  return {
    atTopThreshold: topAutoLoadThreshold,
    firstItemIndex,
    followOutput,
    handleAtBottomStateChange,
    handleAtTopStateChange,
    handleInlinePreviewLoad,
    handleItemsRendered,
    handleJumpToLatest,
    handleLoadOlderHistory,
    handleStartReached,
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

export const resolveRestoredTranscriptScrollIndex = (input: {
  firstItemIndex: number;
  rowKeys: readonly string[];
  snapshot: TranscriptScrollSnapshot | null;
}) => {
  if (!input.snapshot) {
    return null;
  }
  if (input.snapshot.kind === 'latest') {
    return { align: 'end' as const, behavior: 'auto' as const, index: 'LAST' as const };
  }
  const rowIndex = input.rowKeys.indexOf(input.snapshot.rowKey);
  return rowIndex >= 0
    ? { align: 'start' as const, behavior: 'auto' as const, index: input.firstItemIndex + rowIndex }
    : null;
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

const resolveRowKeyFromItemIndex = (
  itemIndex: number,
  rowKeys: readonly string[],
  firstItemIndex: number,
) => rowKeys[itemIndex - firstItemIndex] ?? null;

const scrollToLatest = (virtuoso: GroupedVirtuosoHandle | null) => {
  virtuoso?.scrollToIndex({
    align: 'end',
    behavior: 'auto',
    index: 'LAST',
  });
};
