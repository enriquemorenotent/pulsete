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
  private listeners = new Set<() => void>();
  private historyDirection: 'older' | 'newer' | null = null;
  private pendingSend = false;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  private changed() {
    for (const listener of this.listeners) listener();
  }

  reset() {
    this.state = { kind: 'following-latest', position: null };
    this.historyDirection = null;
    this.pendingSend = false;
    this.changed();
  }

  followLatest(send = false) {
    this.state = { kind: 'following-latest', position: null };
    this.pendingSend = send;
    this.historyDirection = null;
    this.changed();
  }

  readHistory() {
    this.pendingSend = false;
    if (this.state.kind !== 'reading-history') {
      this.state = { kind: 'reading-history', position: this.state.position };
    }
    this.changed();
  }

  jump(rowKey: string) {
    this.state = { kind: 'jumping', rowKey, position: null };
    this.pendingSend = false;
    this.historyDirection = null;
    this.changed();
  }

  restore(position: TranscriptScrollSnapshot) {
    this.state = position.kind === 'latest'
      ? { kind: 'following-latest', position: null }
      : { kind: 'reading-history', position };
    this.pendingSend = false;
    this.changed();
  }

  shouldFollowLatest(hasNewerHistory: boolean) {
    return this.state.kind === 'following-latest' && (!hasNewerHistory || this.pendingSend);
  }

  requestHistory(direction: 'older' | 'newer') {
    this.historyDirection = direction;
    if (direction === 'older') this.readHistory();
  }

  resolveScrollBoundary(input: { atTop: boolean; atBottom: boolean; hasNewerHistory: boolean }): 'older' | 'newer' | null {
    // Only a user request can cross a boundary. Layout measurements alone do
    // not change intent, even if they put the viewport at the live bottom.
    if (this.historyDirection === 'older' && input.atTop) {
      this.historyDirection = null;
      return 'older';
    }
    if (this.historyDirection === 'newer' && input.atBottom) {
      this.historyDirection = null;
      if (input.hasNewerHistory) return 'newer';
      this.followLatest();
    }
    return null;
  }

  capture(scroller: HTMLElement, rowKeys: readonly string[], hasNewerHistory: boolean) {
    const position = captureTranscriptScrollSnapshot(scroller, rowKeys, hasNewerHistory, {
      isAtLatest: () => this.shouldFollowLatest(hasNewerHistory),
    });
    if (position) this.state = { ...this.state, position };
  }

  get snapshot(): TranscriptScrollSnapshot | null {
    if (this.state.kind === 'following-latest' && this.state.position?.kind !== 'anchor') return { kind: 'latest' };
    if (this.state.position) return this.state.position;
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
      isAtLatest: () => this.shouldFollowLatest(hasNewerHistory),
      acceptRow: key => retained.has(key) && !key.startsWith('day-divider:') && !key.startsWith('unread-divider:'),
    });
    return resolveRestoredTranscriptScrollIndex({ firstItemIndex: 0, rowKeys, snapshot: position });
  }
}
