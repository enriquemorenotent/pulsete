import { useCallback, useRef, useState } from 'react';

// A bounded window can remove rows from both ends. Reset Virtuoso's measurements
// on eviction, restoring the actual visible row rather than an overscan row.
export function useTranscriptWindowAnchor(rowKeys: readonly string[], hasNewerHistory = false, jumpToLatestRequestId = 0, focusRequestId = 0, focusRowIndex: number | null = null) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [window, setWindow] = useState({ rows: rowKeys, revision: 0, index: Math.max(0, rowKeys.length - 1), offset: 0, align: 'end' as 'start' | 'end' | 'center', hasNewerHistory, jumpToLatestRequestId, focusRequestId });
  if (window.rows !== rowKeys || window.hasNewerHistory !== hasNewerHistory || window.jumpToLatestRequestId !== jumpToLatestRequestId || window.focusRequestId !== focusRequestId) {
    const nextIndexes = new Map(rowKeys.map((key, index) => [key, index]));
    const messageKeys = window.rows.filter((key) => !key.startsWith('day-divider:') && !key.startsWith('unread-divider:'));
    const evicted = messageKeys.length > 0
      && (!nextIndexes.has(messageKeys[0]!) || !nextIndexes.has(messageKeys.at(-1)!));
    const scroller = containerRef.current?.querySelector('[data-virtuoso-scroller]');
    let anchor: { index: number; offset: number; align: 'start' | 'end' | 'center' } | null = null;
    if (evicted && scroller) {
      const top = scroller.getBoundingClientRect().top;
      for (const element of scroller.querySelectorAll<HTMLElement>('[data-index]')) {
        const rect = element.getBoundingClientRect();
        const key = window.rows[Number(element.dataset.index)];
        const index = key && !key.startsWith('day-divider:') && !key.startsWith('unread-divider:')
          ? nextIndexes.get(key) : undefined;
        if (rect.bottom > top && index !== undefined) {
          anchor = { index, offset: top - rect.top, align: 'start' };
          break;
        }
      }
    }
    if (evicted && scroller && !hasNewerHistory && !window.hasNewerHistory
      && scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop < 4) {
      anchor = { index: rowKeys.length - 1, offset: 0, align: 'end' };
    }
    if (evicted && !anchor && rowKeys.length) {
      anchor = { index: rowKeys.length - 1, offset: 0, align: 'end' };
    }
    if (window.focusRequestId !== focusRequestId && focusRowIndex !== null) {
      anchor = { index: focusRowIndex, offset: 0, align: 'center' };
    }
    // Ordinary jumps use the viewport's scrollToIndex without remounting the list.
    // Only override restoration when a history-window eviction needs a remount.
    if (evicted && window.jumpToLatestRequestId !== jumpToLatestRequestId && rowKeys.length) {
      anchor = { index: rowKeys.length - 1, offset: 0, align: 'end' };
    }
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
