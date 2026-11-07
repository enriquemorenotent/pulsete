import type { TranscriptScrollSnapshot } from './viewport-positioning.js';

// A small gap can leave the last message fully readable without being exactly
// at the scrollbar's end. Keep those views at the latest messages on return.
export const latestScrollSnapshotThreshold = 24;

export function captureTranscriptScrollSnapshot(
  scroller: HTMLElement,
  rowKeys: readonly string[],
  hasNewerHistory: boolean,
): TranscriptScrollSnapshot | null {
  if (!hasNewerHistory
    && scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop <= latestScrollSnapshotThreshold) {
    return { kind: 'latest' };
  }
  const viewport = scroller.getBoundingClientRect();
  for (const element of scroller.querySelectorAll<HTMLElement>('[data-index]')) {
    const rect = element.getBoundingClientRect();
    const rowKey = rowKeys[Number(element.dataset.index)];
    if (rowKey && rect.bottom > viewport.top && rect.top < viewport.bottom) {
      return { kind: 'anchor', rowKey, offset: viewport.top - rect.top };
    }
  }
  return null;
}
