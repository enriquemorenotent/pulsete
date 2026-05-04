const unreadViewportOffsetRatio = 0.25;
export const firstItemIndexBase = 1_000_000;
export const topAutoLoadThreshold = 240;

export type ScrollBehavior = 'auto' | false;

export type TranscriptScrollSnapshot =
  | { kind: 'latest' }
  | { kind: 'anchor'; rowKey: string };

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
