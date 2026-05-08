import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { GroupedVirtuosoHandle, ListItem } from 'react-virtuoso';
import {
  firstItemIndexBase,
  resolveFirstUnreadScrollLocation,
  resolveLatestFollowBehavior,
  resolveRestoredTranscriptScrollIndex,
  resolveRowKeyFromItemIndex,
  scrollToLatest,
  topAutoLoadThreshold,
  type ScrollBehavior,
  type TranscriptScrollSnapshot,
} from './viewport-positioning.js';
import { useTranscriptOlderHistory } from './viewport-older-history.js';

export { resolveFirstUnreadScrollLocation, resolveLatestFollowBehavior, resolveNextFirstItemIndex, resolvePrependedRowCountFromAnchor, resolveRestoredTranscriptScrollIndex, type TranscriptScrollSnapshot } from './viewport-positioning.js';

export type TranscriptInitialScrollTarget = 'latest' | 'first-unread' | 'wait';

type UseTranscriptViewportParams = {
  bufferId: string | null;
  followOutputRequestId: number;
  initialHistoryPending: boolean;
  initialScrollTarget: TranscriptInitialScrollTarget;
  jumpToLatestRequestId: number;
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
  const pendingSendToLatestRef = useRef(false);
  const positionedBufferIdRef = useRef<string | null>(null);
  const previousFollowOutputRequestIdRef = useRef(params.followOutputRequestId);
  const previousJumpToLatestRequestIdRef = useRef(params.jumpToLatestRequestId);
  const scrollSnapshotsRef = useRef(new Map<string, TranscriptScrollSnapshot>());
  const visibleAnchorRowKeyRef = useRef<string | null>(null);
  const [firstItemIndex, setFirstItemIndexValue] = useState(firstItemIndexBase);
  const [isPinnedToLatest, setIsPinnedToLatest] = useState(true);

  const setFirstItemIndex = useCallback((value: number | ((current: number) => number)) => {
    setFirstItemIndexValue((current) => {
      const next = typeof value === 'function' ? value(current) : value;
      firstItemIndexRef.current = next;
      return next;
    });
  }, []);
  const { handleLoadOlderHistory, resetOlderHistory } = useTranscriptOlderHistory({
    loadingOlderHistory: params.loadingOlderHistory,
    onLoadOlderHistory: params.onLoadOlderHistory,
    rowKeys: params.rowKeys,
    setFirstItemIndex,
  });

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

  useEffect(() => {
    if (params.jumpToLatestRequestId === previousJumpToLatestRequestIdRef.current) {
      return;
    }
    previousJumpToLatestRequestIdRef.current = params.jumpToLatestRequestId;
    if (!params.bufferId || params.totalItemCount === 0) {
      return;
    }
    scrollSnapshotsRef.current.set(params.bufferId, { kind: 'latest' });
    visibleAnchorRowKeyRef.current = null;
    isPinnedToLatestRef.current = true;
    setIsPinnedToLatest(true);
    scrollToLatest(virtuosoRef.current);
  }, [params.bufferId, params.jumpToLatestRequestId, params.totalItemCount]);

  useLayoutEffect(() => {
    if (currentBufferIdRef.current === params.bufferId) {
      return;
    }
    saveBufferScrollSnapshot(currentBufferIdRef.current);
    currentBufferIdRef.current = params.bufferId;
    firstItemIndexRef.current = firstItemIndexBase;
    isPinnedToLatestRef.current = true;
    resetOlderHistory();
    pendingSendToLatestRef.current = false;
    positionedBufferIdRef.current = null;
    visibleAnchorRowKeyRef.current = null;
    setFirstItemIndex(firstItemIndexBase);
    setIsPinnedToLatest(true);
  }, [params.bufferId, resetOlderHistory, saveBufferScrollSnapshot, setFirstItemIndex]);

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
    },
    [],
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
    handleLoadOlderHistory,
    handleStartReached,
    scrollerRef: setScrollerNode,
    virtuosoRef,
  };
}
