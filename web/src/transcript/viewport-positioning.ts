const unreadViewportOffsetRatio = 0.25;
export const firstItemIndexBase = 1_000_000;
export const topAutoLoadThreshold = 240;

export type ScrollBehavior = 'auto' | false;

export type TranscriptScrollSnapshot =
  | { kind: 'latest' }
  | { kind: 'anchor'; rowKey: string; offset?: number };

export const resolveLatestFollowBehavior = (input: {
  followingLatest: boolean;
  pendingSendToLatest: boolean;
}): ScrollBehavior =>
  input.pendingSendToLatest || input.followingLatest ? 'auto' : false;

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
    ? {
        align: 'start' as const,
        behavior: 'auto' as const,
        index: input.firstItemIndex + rowIndex,
        ...(input.snapshot.offset !== undefined ? { offset: input.snapshot.offset } : {}),
      }
    : null;
};

// Virtuoso accepts a number or a location object, but not explicit undefined.
// Resolve every startup state before passing the position to the list.
export const resolveInitialTranscriptScrollLocation = (input: {
  rowKeys: readonly string[];
  snapshot: TranscriptScrollSnapshot | null;
  target: 'latest' | 'first-unread' | 'wait';
  unreadRowIndex: number | null;
}) => resolveRestoredTranscriptScrollIndex({ ...input, firstItemIndex: 0 })
  ?? (input.target === 'latest'
    ? { index: 'LAST' as const, align: 'end' as const }
    : input.target === 'first-unread' && input.unreadRowIndex !== null
      ? { index: input.unreadRowIndex, align: 'start' as const }
      : 0);

export const resolveFirstUnreadScrollLocation = (
  unreadRowIndex: number,
  scrollerHeight: number,
) => ({
  align: 'start' as const,
  behavior: 'auto' as const,
  index: unreadRowIndex,
  offset: -Math.round(scrollerHeight * unreadViewportOffsetRatio),
});

export const resolveRowKeyFromItemIndex = (
  itemIndex: number,
  rowKeys: readonly string[],
  firstItemIndex: number,
) => rowKeys[itemIndex - firstItemIndex] ?? null;

type ScrollToLatestHandle = {
  scrollToIndex: (location: { align: 'end'; behavior: 'auto'; index: 'LAST' }) => void;
};

export const scrollToLatest = (virtuoso: ScrollToLatestHandle | null) => {
  virtuoso?.scrollToIndex({
    align: 'end',
    behavior: 'auto',
    index: 'LAST',
  });
};
