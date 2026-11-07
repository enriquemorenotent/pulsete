import { captureTranscriptScrollSnapshot } from './capture-scroll-snapshot.js';
import { resolveRestoredTranscriptScrollIndex, type TranscriptScrollSnapshot } from './viewport-positioning.js';

type ViewportState =
  | { kind: 'following-latest'; position: TranscriptScrollSnapshot | null }
  | { kind: 'reading-history'; position: TranscriptScrollSnapshot | null }
  | { kind: 'jumping'; rowKey: string; position: TranscriptScrollSnapshot | null };

// Scroll intent lives here. DOM measurements describe where we are; only user
// input, explicit requests, or reaching the live bottom change what we follow.
export class TranscriptViewportController {
  private state: ViewportState = { kind: 'following-latest', position: null };
  private atBottom = true;
  private pendingSend = false;

  reset() {
    this.state = { kind: 'following-latest', position: null };
    this.atBottom = true;
    this.pendingSend = false;
  }

  followLatest(send = false) {
    this.state = { kind: 'following-latest', position: null };
    this.pendingSend = send;
    if (!send) this.atBottom = true;
  }

  readHistory() {
    if (this.state.kind !== 'reading-history') {
      this.state = { kind: 'reading-history', position: this.state.position };
    }
  }

  jump(rowKey: string) {
    this.state = { kind: 'jumping', rowKey, position: null };
    this.atBottom = false;
  }

  restore(position: TranscriptScrollSnapshot) {
    this.state = position.kind === 'latest'
      ? { kind: 'following-latest', position: null }
      : { kind: 'reading-history', position };
  }

  bottomChanged(atBottom: boolean, hasNewerHistory: boolean) {
    this.atBottom = atBottom;
    if (atBottom && !hasNewerHistory) this.followLatest(this.pendingSend);
  }

  followOutput(hasNewerHistory: boolean): 'auto' | false {
    if (this.pendingSend || (this.state.kind === 'following-latest' && !hasNewerHistory)) {
      this.pendingSend = false;
      return 'auto';
    }
    return false;
  }

  get shouldFollowPreview() {
    return this.atBottom || this.pendingSend;
  }

  capture(scroller: HTMLElement, rowKeys: readonly string[], hasNewerHistory: boolean) {
    const position = captureTranscriptScrollSnapshot(scroller, rowKeys, hasNewerHistory);
    if (position) this.state = { ...this.state, position };
  }

  get snapshot(): TranscriptScrollSnapshot | null {
    if (this.state.position) return this.state.position;
    if (this.state.kind === 'following-latest') return { kind: 'latest' };
    return (this.state.kind === 'jumping'
      ? { kind: 'anchor', rowKey: this.state.rowKey } : null);
  }

  resolveWindowChange(input: {
    previous: { rows: readonly string[]; hasNewerHistory: boolean; jumpToLatestRequestId: number; focusRequestId: number };
    rowKeys: readonly string[];
    hasNewerHistory: boolean;
    jumpToLatestRequestId: number;
    focusRequestId: number;
    focusRowIndex: number | null;
    scroller: HTMLElement | null;
  }) {
    const { previous, rowKeys, scroller } = input;
    const retained = new Set(rowKeys);
    const messages = previous.rows.filter(key => !key.startsWith('day-divider:') && !key.startsWith('unread-divider:'));
    const evicted = messages.length > 0 && (!retained.has(messages[0]!) || !retained.has(messages.at(-1)!));
    const latest = { index: rowKeys.length - 1, offset: 0, align: 'end' as const };
    // A latest request wins when replacing the window. Ordinary latest requests
    // use scrollToIndex and don't need a new Virtuoso instance.
    if (evicted && previous.jumpToLatestRequestId !== input.jumpToLatestRequestId && rowKeys.length) return latest;
    if (previous.focusRequestId !== input.focusRequestId && input.focusRowIndex !== null) {
      return { index: input.focusRowIndex, offset: 0, align: 'center' as const };
    }
    if (!evicted) return null;
    const location = scroller ? this.windowLocation(
      scroller, previous.rows, rowKeys, input.hasNewerHistory || previous.hasNewerHistory,
    ) : null;
    if (location) return {
      index: location.index === 'LAST' ? rowKeys.length - 1 : location.index,
      align: location.align, offset: 'offset' in location ? location.offset ?? 0 : 0,
    };
    return rowKeys.length ? latest : null;
  }

  private windowLocation(scroller: HTMLElement, previousRows: readonly string[], rowKeys: readonly string[], hasNewerHistory: boolean) {
    const retained = new Set(rowKeys);
    const position = captureTranscriptScrollSnapshot(scroller, previousRows, hasNewerHistory, {
      // Keep the existing stricter live-bottom rule during window eviction.
      isAtLatest: distance => distance < 4,
      acceptRow: key => retained.has(key) && !key.startsWith('day-divider:') && !key.startsWith('unread-divider:'),
    });
    return resolveRestoredTranscriptScrollIndex({ firstItemIndex: 0, rowKeys, snapshot: position });
  }
}
