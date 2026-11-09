import { useCallback, useRef, useState } from 'react';
import type { VirtuosoHandle } from 'react-virtuoso';
import type { TranscriptViewportController } from './viewport-controller.js';

// A bounded window can remove rows from both ends. Reset Virtuoso's measurements
// on eviction, restoring the actual visible row rather than an overscan row.
export function useTranscriptWindowAnchor(rowKeys: readonly string[], controller: TranscriptViewportController, hasNewerHistory = false, jumpToLatestRequestId = 0, focusRequestId = 0, focusRowIndex: number | null = null) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [window, setWindow] = useState({ rows: rowKeys, revision: 0, index: Math.max(0, rowKeys.length - 1), offset: 0, align: 'end' as 'start' | 'end' | 'center', hasNewerHistory, jumpToLatestRequestId, focusRequestId });
  if (window.rows !== rowKeys || window.hasNewerHistory !== hasNewerHistory || window.jumpToLatestRequestId !== jumpToLatestRequestId || window.focusRequestId !== focusRequestId) {
    const anchor = controller.resolveWindowChange({
      previous: window, rowKeys, hasNewerHistory, jumpToLatestRequestId, focusRequestId, focusRowIndex,
      scroller: containerRef.current?.querySelector<HTMLElement>('[data-virtuoso-scroller]') ?? null,
    });
    setWindow({ rows: rowKeys, hasNewerHistory, jumpToLatestRequestId, focusRequestId, revision: window.revision + (anchor ? 1 : 0),
      index: anchor?.index ?? window.index, offset: anchor?.offset ?? window.offset,
      align: anchor?.align ?? window.align });
  }
  const readyRevisionRef = useRef(0);
  const requestedRevisionRef = useRef(0);
  const isRestoring = useCallback(() => readyRevisionRef.current !== window.revision, [window.revision]);
  const restore = useCallback((virtuoso: VirtuosoHandle | null) => {
    if (!virtuoso || requestedRevisionRef.current === window.revision) return;
    requestedRevisionRef.current = window.revision;
    // Virtuoso owns measurement and scrolling. Its completion callback releases
    // history loading only after the requested position has been applied.
    virtuoso.scrollIntoView({
      index: window.index,
      calculateViewLocation: () => ({ index: window.index, align: window.align, offset: window.offset, behavior: 'auto' }),
      done: () => { readyRevisionRef.current = window.revision; },
    });
  }, [window.revision, window.index, window.align, window.offset]);
  return {
    containerRef,
    isRestoring,
    restore,
    key: window.revision,
    initialTopMostItemIndex: window.revision
      ? { index: window.index, align: window.align, offset: window.offset }
      : undefined,
  };
}
