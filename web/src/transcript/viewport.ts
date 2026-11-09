import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { VirtuosoHandle } from 'react-virtuoso';
import {
  firstItemIndexBase,
  resolveFirstUnreadScrollLocation,
  resolveInitialTranscriptScrollLocation,
  resolveRestoredTranscriptScrollIndex,
  scrollToLatest,
  topAutoLoadThreshold,
} from './viewport-positioning.js';
import { useTranscriptOlderHistory } from './viewport-older-history.js';
import { TranscriptViewportController } from './viewport-controller.js';
import { useTranscriptWindowAnchor } from './window-anchor.js';
import { latestScrollSnapshotThreshold } from './capture-scroll-snapshot.js';
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
  onLoadNewerHistory?: () => Promise<number>;
  hasNewerHistory?: boolean;
  rowKeys: readonly string[];
  totalItemCount: number;
  unreadRowIndex: number | null;
};

export function useTranscriptViewport(params: UseTranscriptViewportParams) {
  const virtuosoRef = useRef<VirtuosoHandle | null>(null);
  const scrollerRef = useRef<HTMLElement | null>(null);
  const currentBufferIdRef = useRef<string | null>(null);
  const [controller] = useState(() => new TranscriptViewportController());
  const windowAnchor = useTranscriptWindowAnchor(
    params.rowKeys, controller, params.hasNewerHistory, params.jumpToLatestRequestId, params.focusRequestId, params.focusRowIndex,
  );
  const isRestoringWindow = windowAnchor.isRestoring;
  const [savedScrollSnapshot] = useState(() =>
    params.bufferId ? transcriptScrollSnapshots.get(params.bufferId) : null,
  );
  const initialScrollLocation = resolveInitialTranscriptScrollLocation({
    rowKeys: params.rowKeys, snapshot: savedScrollSnapshot,
    target: params.initialScrollTarget, unreadRowIndex: params.unreadRowIndex,
  });
  const scrollerPointerDownRef = useRef(false);
  const followingLatest = useSyncExternalStore(
    controller.subscribe,
    () => controller.shouldFollowLatest(params.hasNewerHistory ?? false),
  );
  const positionedBufferIdRef = useRef<string | null>(null);
  const previousFollowOutputRequestIdRef = useRef(params.followOutputRequestId);
  const previousFocusRequestIdRef = useRef(0);
  const previousJumpToLatestRequestIdRef = useRef(params.jumpToLatestRequestId);
  const captureSnapshotRef = useRef<() => void>(() => {});
  const [firstItemIndex, setFirstItemIndex] = useState(firstItemIndexBase);

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
    const snapshot = controller.snapshot;
    if (snapshot) transcriptScrollSnapshots.set(bufferId, snapshot);
  }, [controller]);

  useEffect(() => {
    if (params.followOutputRequestId === previousFollowOutputRequestIdRef.current) {
      return;
    }
    previousFollowOutputRequestIdRef.current = params.followOutputRequestId;
    controller.followLatest(true);
  }, [controller, params.followOutputRequestId]);

  useEffect(() => {
    if (params.jumpToLatestRequestId === previousJumpToLatestRequestIdRef.current) {
      return;
    }
    previousJumpToLatestRequestIdRef.current = params.jumpToLatestRequestId;
    if (!params.bufferId || params.totalItemCount === 0) {
      return;
    }
    transcriptScrollSnapshots.set(params.bufferId, { kind: 'latest' });
    controller.followLatest();
    scrollToLatest(virtuosoRef.current);
  }, [controller, params.bufferId, params.jumpToLatestRequestId, params.totalItemCount]);

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
    if (rowKey) controller.jump(rowKey);
    if (rowKey) {
      transcriptScrollSnapshots.set(params.bufferId, { kind: 'anchor', rowKey });
    }
    virtuosoRef.current?.scrollToIndex({
      align: 'center',
      behavior: 'auto',
      index: params.focusRowIndex,
    });
  }, [
    controller,
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
    controller.reset();
    resetOlderHistory();
    positionedBufferIdRef.current = null;
    setFirstItemIndex(firstItemIndexBase);
  }, [controller, params.bufferId, resetOlderHistory, saveBufferScrollSnapshot, setFirstItemIndex]);

  // Read the final DOM before React detaches it. Render callbacks can run
  // before the newly visible rows have actually been committed.
  useLayoutEffect(() => () => {
    captureSnapshotRef.current();
    saveBufferScrollSnapshot(currentBufferIdRef.current);
  }, [saveBufferScrollSnapshot]);

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

    const saved = transcriptScrollSnapshots.get(params.bufferId);
    const restored = resolveRestoredTranscriptScrollIndex({
      firstItemIndex: 0,
      rowKeys: params.rowKeys,
      snapshot: saved,
    });
    if (restored !== null) {
      controller.restore(saved!);
      virtuosoRef.current?.scrollToIndex(restored);
      positionedBufferIdRef.current = params.bufferId;
      return;
    }

    if (params.initialScrollTarget === 'first-unread' && params.unreadRowIndex !== null) {
      const rowKey = params.rowKeys[params.unreadRowIndex];
      if (rowKey) controller.jump(rowKey);
      virtuosoRef.current?.scrollToIndex(
        resolveFirstUnreadScrollLocation(
          params.unreadRowIndex,
          scrollerRef.current?.clientHeight ?? 0,
        ),
      );
    } else {
      scrollToLatest(virtuosoRef.current);
    }

    positionedBufferIdRef.current = params.bufferId;
  }, [
    controller,
    params.bufferId,
    params.initialHistoryPending,
    params.initialScrollTarget,
    params.rowKeys,
    params.totalItemCount,
    params.unreadRowIndex,
  ]);

  const resolveScrollBoundary = useCallback(() => {
    const node = scrollerRef.current;
    if (!node || positionedBufferIdRef.current !== params.bufferId
      || params.initialHistoryPending || isRestoringWindow()) return;
    const action = controller.resolveScrollBoundary({
      atTop: node.scrollTop <= topAutoLoadThreshold,
      atBottom: node.scrollHeight - node.clientHeight - node.scrollTop <= latestScrollSnapshotThreshold,
      hasNewerHistory: params.hasNewerHistory ?? false,
    });
    if (action === 'older') void handleLoadOlderHistory();
    if (action === 'newer') void params.onLoadNewerHistory?.();
  }, [controller, params.bufferId, params.initialHistoryPending, params.hasNewerHistory,
    params.onLoadNewerHistory, handleLoadOlderHistory, isRestoringWindow]);

  const requestScroll = useCallback((direction: 'older' | 'newer') => {
    controller.requestHistory(direction);
    // At an existing edge the browser cannot move, so no scroll event follows.
    resolveScrollBoundary();
  }, [controller, resolveScrollBoundary]);

  // Every height change uses the same intent, regardless of which row grew.
  // Capture on scroll, not render: layout changes must not replace the old anchor
  // before we have restored it.
  const handleLayoutChange = useCallback(() => {
    if (positionedBufferIdRef.current !== params.bufferId || isRestoringWindow()) return;
    if (controller.shouldFollowLatest(params.hasNewerHistory ?? false)) {
      scrollToLatest(virtuosoRef.current);
    } else {
      const position = controller.snapshot;
      const node = scrollerRef.current;
      if (node && position?.kind === 'anchor') {
        const row = [...node.querySelectorAll<HTMLElement>('[data-transcript-row-key]')]
          .find(row => row.dataset.transcriptRowKey === position.rowKey);
        if (row) {
          const correction = row.getBoundingClientRect().top - node.getBoundingClientRect().top + (position.offset ?? 0);
          if (Math.abs(correction) >= 1) virtuosoRef.current?.scrollBy({ top: correction, behavior: 'auto' });
        }
      }
    }
  }, [controller, params.bufferId, params.hasNewerHistory, isRestoringWindow]);

  const capturePosition = useCallback(() => {
    const node = scrollerRef.current;
    if (node && positionedBufferIdRef.current === params.bufferId && !isRestoringWindow()) {
      controller.capture(node, params.rowKeys, params.hasNewerHistory ?? false);
    }
  }, [controller, params.bufferId, params.rowKeys, params.hasNewerHistory, isRestoringWindow]);

  useLayoutEffect(() => {
    captureSnapshotRef.current = capturePosition;
  }, [capturePosition]);

  const stopFollowingLatest = useCallback(() => {
    controller.readHistory();
  }, [controller]);

  const handleScrollerWheel = useCallback((event: WheelEvent) => {
    if (event.deltaY < 0) {
      requestScroll('older');
    } else if (event.deltaY > 0) {
      requestScroll('newer');
    }
  }, [requestScroll]);

  const handleScrollerKeyDown = useCallback((event: KeyboardEvent) => {
    if (
      event.key === 'ArrowUp'
      || event.key === 'PageUp'
      || event.key === 'Home'
      || (event.key === ' ' && event.shiftKey)
    ) {
      requestScroll('older');
    } else if (['ArrowDown', 'PageDown', 'End', ' '].includes(event.key)) {
      requestScroll('newer');
    }
  }, [requestScroll]);

  const handleScrollerPointerDown = useCallback(() => {
    scrollerPointerDownRef.current = true;
  }, []);

  const handleScrollerPointerUp = useCallback(() => {
    scrollerPointerDownRef.current = false;
  }, []);

  const previousScrollTopRef = useRef(0);
  const handleScrollerScroll = useCallback(() => {
    const node = scrollerRef.current;
    if (node && scrollerPointerDownRef.current) {
      controller.requestHistory(node.scrollTop < previousScrollTopRef.current ? 'older' : 'newer');
    }
    previousScrollTopRef.current = node?.scrollTop ?? 0;
    if (
      scrollerPointerDownRef.current
      && node
      && node.scrollHeight - node.clientHeight - node.scrollTop > latestScrollSnapshotThreshold
    ) {
      stopFollowingLatest();
    }
    resolveScrollBoundary();
    capturePosition();
  }, [controller, stopFollowingLatest, capturePosition, resolveScrollBoundary]);

  const setScrollerNode = useCallback((node: HTMLElement | null | Window) => {
    const previousNode = scrollerRef.current;
    if (previousNode) {
      previousNode.removeEventListener('wheel', handleScrollerWheel);
      previousNode.removeEventListener('keydown', handleScrollerKeyDown);
      previousNode.removeEventListener('pointerdown', handleScrollerPointerDown);
      previousNode.removeEventListener('pointerup', handleScrollerPointerUp);
      previousNode.removeEventListener('pointercancel', handleScrollerPointerUp);
      previousNode.removeEventListener('scroll', handleScrollerScroll);
    }
    const nextNode = node instanceof HTMLElement ? node : null;
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
    windowAnchor,
    initialScrollLocation,
    firstItemIndex,
    followOutput: followingLatest ? 'auto' as const : false as const,
    handleLayoutChange,
    atBottomThreshold: latestScrollSnapshotThreshold,
    handleLoadOlderHistory,
    scrollerRef: setScrollerNode,
    virtuosoRef,
  };
}
