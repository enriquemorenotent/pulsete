import { useCallback, useRef, useState } from 'react';
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
  const isRestoring = useCallback(() => {
    if (readyRevisionRef.current === window.revision) return false;
    const scroller = containerRef.current?.querySelector('[data-virtuoso-scroller]');
    const row = scroller?.querySelector(`[data-index="${window.index}"]`);
    if (scroller && row && (window.index === 0 || scroller.scrollTop > 0)
      && row.getBoundingClientRect().bottom > scroller.getBoundingClientRect().top
      && row.getBoundingClientRect().top < scroller.getBoundingClientRect().bottom) {
      readyRevisionRef.current = window.revision;
      return false;
    }
    return true;
  }, [window.revision, window.index, window.offset]);
  return {
    containerRef,
    isRestoring,
    key: window.revision,
    initialTopMostItemIndex: window.revision
      ? { index: window.index, align: window.align, offset: window.offset }
      : undefined,
  };
}
