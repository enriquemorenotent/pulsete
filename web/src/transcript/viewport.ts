import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ListItem, VirtuosoHandle } from 'react-virtuoso';
import {
  firstItemIndexBase,
  resolveFirstUnreadScrollLocation,
  resolveLatestFollowBehavior,
  resolveRestoredTranscriptScrollIndex,
  resolveRowKeyFromItemIndex,
  scrollToLatest,
  topAutoLoadThreshold,
  type ScrollBehavior,
} from './viewport-positioning.js';
import { useTranscriptOlderHistory } from './viewport-older-history.js';
import { transcriptScrollSnapshots } from './scroll-snapshot-store.js';

export { resolveFirstUnreadScrollLocation, resolveLatestFollowBehavior, resolveNextFirstItemIndex, resolvePrependedRowCountFromAnchor, resolveRestoredTranscriptScrollIndex, type TranscriptScrollSnapshot } from './viewport-positioning.js';

export type TranscriptInitialScrollTarget = 'latest' | 'first-unread' | 'wait';

type UseTranscriptViewportParams = {
  bufferId: string | null;
  followOutputRequestId: number;
  focusRequestId: number;
  focusRowIndex: number | null;
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
  const virtuosoRef = useRef<VirtuosoHandle | null>(null);
  const scrollerRef = useRef<HTMLElement | null>(null);
  const currentBufferIdRef = useRef<string | null>(null);
  const firstItemIndexRef = useRef(firstItemIndexBase);
  const isPinnedToLatestRef = useRef(true);
  const isFollowingLatestRef = useRef(true);
  const scrollerPointerDownRef = useRef(false);
  const scrollerNodeRef = useRef<HTMLElement | null>(null);
  const pendingSendToLatestRef = useRef(false);
  const positionedBufferIdRef = useRef<string | null>(null);
  const previousFollowOutputRequestIdRef = useRef(params.followOutputRequestId);
  const previousFocusRequestIdRef = useRef(0);
  const previousJumpToLatestRequestIdRef = useRef(params.jumpToLatestRequestId);
  const visibleAnchorRowKeyRef = useRef<string | null>(null);
  const [firstItemIndex, setFirstItemIndexValue] = useState(firstItemIndexBase);
  const [isPinnedToLatest, setIsPinnedToLatest] = useState(true);

  const setFirstItemIndex = useCallback((value: number | ((current: number) => number)) => {
    if (typeof value === 'number') {
      firstItemIndexRef.current = value;
    }
    setFirstItemIndexValue(value);
  }, []);
  useLayoutEffect(() => {
    firstItemIndexRef.current = firstItemIndex;
  }, [firstItemIndex]);
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
      transcriptScrollSnapshots.set(bufferId, { kind: 'latest' });
      return;
    }
    const rowKey = visibleAnchorRowKeyRef.current;
    if (rowKey) {
      transcriptScrollSnapshots.set(bufferId, { kind: 'anchor', rowKey });
    }
  }, []);

  useEffect(() => {
    if (params.followOutputRequestId === previousFollowOutputRequestIdRef.current) {
      return;
    }
    previousFollowOutputRequestIdRef.current = params.followOutputRequestId;
    pendingSendToLatestRef.current = true;
    isFollowingLatestRef.current = true;
  }, [params.followOutputRequestId]);

  useEffect(() => {
    if (params.jumpToLatestRequestId === previousJumpToLatestRequestIdRef.current) {
      return;
    }
    previousJumpToLatestRequestIdRef.current = params.jumpToLatestRequestId;
    if (!params.bufferId || params.totalItemCount === 0) {
      return;
    }
    transcriptScrollSnapshots.set(params.bufferId, { kind: 'latest' });
    visibleAnchorRowKeyRef.current = null;
    isPinnedToLatestRef.current = true;
    isFollowingLatestRef.current = true;
    setIsPinnedToLatest(true);
    scrollToLatest(virtuosoRef.current);
  }, [params.bufferId, params.jumpToLatestRequestId, params.totalItemCount]);

  useEffect(() => {
    if (
      params.focusRequestId <= 0
      || params.focusRequestId === previousFocusRequestIdRef.current
    ) {
      return;
    }
    previousFocusRequestIdRef.current = params.focusRequestId;
    if (!params.bufferId || params.focusRowIndex === null || params.totalItemCount === 0) {
      return;
    }
    const rowKey = params.rowKeys[params.focusRowIndex] ?? null;
    visibleAnchorRowKeyRef.current = rowKey;
    isPinnedToLatestRef.current = false;
    isFollowingLatestRef.current = false;
    setIsPinnedToLatest(false);
    if (rowKey) {
      transcriptScrollSnapshots.set(params.bufferId, { kind: 'anchor', rowKey });
    }
    virtuosoRef.current?.scrollToIndex({
      align: 'center',
      behavior: 'auto',
      index: firstItemIndexRef.current + params.focusRowIndex,
    });
  }, [
    params.bufferId,
    params.focusRequestId,
    params.focusRowIndex,
    params.rowKeys,
    params.totalItemCount,
  ]);

  useLayoutEffect(() => {
    if (currentBufferIdRef.current === params.bufferId) {
      return;
    }
    saveBufferScrollSnapshot(currentBufferIdRef.current);
    currentBufferIdRef.current = params.bufferId;
    firstItemIndexRef.current = firstItemIndexBase;
    isPinnedToLatestRef.current = true;
    isFollowingLatestRef.current = true;
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
      snapshot: transcriptScrollSnapshots.get(params.bufferId),
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
    (_atLatest: boolean): ScrollBehavior => {
      const behavior = resolveLatestFollowBehavior({
        followingLatest: isFollowingLatestRef.current,
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
      if (nextAtBottom) {
        isFollowingLatestRef.current = true;
      }
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

  const stopFollowingLatest = useCallback(() => {
    isFollowingLatestRef.current = false;
  }, []);

  const handleScrollerWheel = useCallback((event: WheelEvent) => {
    if (event.deltaY < 0) {
      stopFollowingLatest();
    }
  }, [stopFollowingLatest]);

  const handleScrollerKeyDown = useCallback((event: KeyboardEvent) => {
    if (
      event.key === 'ArrowUp'
      || event.key === 'PageUp'
      || event.key === 'Home'
      || (event.key === ' ' && event.shiftKey)
    ) {
      stopFollowingLatest();
    }
  }, [stopFollowingLatest]);

  const handleScrollerPointerDown = useCallback(() => {
    scrollerPointerDownRef.current = true;
  }, []);

  const handleScrollerPointerUp = useCallback(() => {
    scrollerPointerDownRef.current = false;
  }, []);

  const handleScrollerScroll = useCallback(() => {
    const node = scrollerNodeRef.current;
    if (
      scrollerPointerDownRef.current
      && node
      && node.scrollHeight - node.clientHeight - node.scrollTop > 4
    ) {
      stopFollowingLatest();
    }
  }, [stopFollowingLatest]);

  const setScrollerNode = useCallback((node: HTMLElement | null | Window) => {
    const previousNode = scrollerNodeRef.current;
    if (previousNode) {
      previousNode.removeEventListener('wheel', handleScrollerWheel);
      previousNode.removeEventListener('keydown', handleScrollerKeyDown);
      previousNode.removeEventListener('pointerdown', handleScrollerPointerDown);
      previousNode.removeEventListener('pointerup', handleScrollerPointerUp);
      previousNode.removeEventListener('pointercancel', handleScrollerPointerUp);
      previousNode.removeEventListener('scroll', handleScrollerScroll);
    }
    const nextNode = node instanceof HTMLElement ? node : null;
    scrollerNodeRef.current = nextNode;
    scrollerRef.current = nextNode;
    if (nextNode) {
      nextNode.addEventListener('wheel', handleScrollerWheel, { passive: true });
      nextNode.addEventListener('keydown', handleScrollerKeyDown);
      nextNode.addEventListener('pointerdown', handleScrollerPointerDown);
      nextNode.addEventListener('pointerup', handleScrollerPointerUp);
      nextNode.addEventListener('pointercancel', handleScrollerPointerUp);
      nextNode.addEventListener('scroll', handleScrollerScroll, { passive: true });
    }
  }, [
    handleScrollerKeyDown,
    handleScrollerPointerDown,
    handleScrollerPointerUp,
    handleScrollerScroll,
    handleScrollerWheel,
  ]);

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
