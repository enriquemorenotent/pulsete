import assert from 'node:assert/strict';
import test from 'node:test';
import {
  expireProgrammaticScrollTransaction,
  isProgrammaticScrollEvent,
  resolveElementViewportScrollTop,
  resolveSelectionPositionMode,
  resolveUnreadViewportOffset,
  restoreScrollOffsetAfterPrepend,
  shouldShowJumpToLatestControl,
  shouldAutoLoadOlderHistory,
} from '../web/src/ChatPaneMessageList.js';
import { buildRenderBlocks } from '../web/src/chat-pane-message-utils.js';

test('auto-load older history triggers once the transcript reaches the top edge', () => {
  assert.equal(shouldAutoLoadOlderHistory({
    canLoadOlderHistory: true,
    loadingOlderHistory: false,
    loadingOlderInFlight: false,
    scrollTop: 0,
  }), true);
  assert.equal(shouldAutoLoadOlderHistory({
    canLoadOlderHistory: true,
    loadingOlderHistory: false,
    loadingOlderInFlight: false,
    scrollTop: 24,
  }), true);
  assert.equal(shouldAutoLoadOlderHistory({
    canLoadOlderHistory: true,
    loadingOlderHistory: false,
    loadingOlderInFlight: false,
    scrollTop: 25,
  }), false);
});

test('auto-load older history stays disabled while a page is already loading', () => {
  assert.equal(shouldAutoLoadOlderHistory({
    canLoadOlderHistory: true,
    loadingOlderHistory: true,
    loadingOlderInFlight: false,
    scrollTop: 0,
  }), false);
  assert.equal(shouldAutoLoadOlderHistory({
    canLoadOlderHistory: true,
    loadingOlderHistory: false,
    loadingOlderInFlight: true,
    scrollTop: 0,
  }), false);
});

test('restoring scroll offset keeps the visible transcript anchored after prepending older rows', () => {
  const node = { scrollHeight: 640, scrollTop: 0 };

  restoreScrollOffsetAfterPrepend(node, 400, 0);
  assert.equal(node.scrollTop, 240);

  node.scrollHeight = 860;
  restoreScrollOffsetAfterPrepend(node, 640, 72);
  assert.equal(node.scrollTop, 292);
});

test('programmatic scroll ownership matches the active buffer and expected scroll position', () => {
  assert.equal(isProgrammaticScrollEvent({
    activeTransaction: { bufferId: 'buffer-1', expectedScrollTop: 240 },
    bufferId: 'buffer-1',
    scrollTop: 240,
  }), true);
  assert.equal(isProgrammaticScrollEvent({
    activeTransaction: { bufferId: 'buffer-1', expectedScrollTop: 240 },
    bufferId: 'buffer-1',
    scrollTop: 241,
  }), true);
});

test('programmatic scroll ownership yields to divergent scroll positions and other buffers', () => {
  assert.equal(isProgrammaticScrollEvent({
    activeTransaction: { bufferId: 'buffer-1', expectedScrollTop: 240 },
    bufferId: 'buffer-1',
    scrollTop: 242,
  }), false);
  assert.equal(isProgrammaticScrollEvent({
    activeTransaction: { bufferId: 'buffer-1', expectedScrollTop: 240 },
    bufferId: 'buffer-2',
    scrollTop: 240,
  }), false);
  assert.equal(isProgrammaticScrollEvent({
    activeTransaction: null,
    bufferId: 'buffer-1',
    scrollTop: 240,
  }), false);
});

test('programmatic scroll transactions expire only for the matching frame token', () => {
  assert.equal(
    expireProgrammaticScrollTransaction(
      { bufferId: 'buffer-1', expectedScrollTop: 240, token: 3 },
      3,
    ),
    null,
  );
  assert.deepEqual(
    expireProgrammaticScrollTransaction(
      { bufferId: 'buffer-1', expectedScrollTop: 240, token: 4 },
      3,
    ),
    { bufferId: 'buffer-1', expectedScrollTop: 240, token: 4 },
  );
});

test('selection positioning keeps waiting only while the initial unread history page is loading', () => {
  assert.equal(resolveSelectionPositionMode({
    initialHistoryPending: true,
    initialScrollTarget: 'wait',
  }), 'wait');
  assert.equal(resolveSelectionPositionMode({
    initialHistoryPending: false,
    initialScrollTarget: 'wait',
  }), 'bottom');
  assert.equal(resolveSelectionPositionMode({
    initialHistoryPending: true,
    initialScrollTarget: 'first-unread',
  }), 'first-unread');
});

test('selection positioning targets the upper third of the viewport for unread content', () => {
  assert.equal(resolveUnreadViewportOffset({ clientHeight: 200 }), 50);
  assert.equal(resolveUnreadViewportOffset({ clientHeight: 96 }), 24);
});

test('selection positioning clamps unread placement within the transcript bounds', () => {
  assert.equal(
    resolveElementViewportScrollTop(
      { clientHeight: 100, scrollHeight: 320 },
      20,
      25,
    ),
    0,
  );
  assert.equal(
    resolveElementViewportScrollTop(
      { clientHeight: 100, scrollHeight: 320 },
      290,
      25,
    ),
    220,
  );
});

test('jump-to-latest stays hidden for empty transcripts and near-bottom views', () => {
  assert.equal(shouldShowJumpToLatestControl({
    messagesLength: 0,
    scrollMetrics: { clientHeight: 100, scrollHeight: 400, scrollTop: 180 },
  }), false);
  assert.equal(shouldShowJumpToLatestControl({
    messagesLength: 3,
    scrollMetrics: { clientHeight: 100, scrollHeight: 400, scrollTop: 276 },
  }), false);
});

test('jump-to-latest becomes visible once the user is away from the live edge', () => {
  assert.equal(shouldShowJumpToLatestControl({
    messagesLength: 3,
    scrollMetrics: { clientHeight: 100, scrollHeight: 400, scrollTop: 180 },
  }), true);
});

test('buildRenderBlocks inserts day dividers only when the local calendar day changes', () => {
  const blocks = buildRenderBlocks([
    { id: 'message-1', networkId: 'network-1', target: '#help', nick: 'Joby', body: 'late', kind: 'line', self: false, ts: new Date(2026, 2, 11, 2, 57, 0, 0).getTime() },
    { id: 'message-2', networkId: 'network-1', target: '#help', nick: 'Joby', body: 'still same day', kind: 'line', self: false, ts: new Date(2026, 2, 11, 8, 12, 0, 0).getTime() },
    { id: 'message-3', networkId: 'network-1', target: '#help', nick: 'Joby', body: 'next day', kind: 'line', self: false, ts: new Date(2026, 2, 12, 0, 5, 0, 0).getTime() },
  ], { now: new Date(2026, 2, 28, 12, 0, 0, 0).getTime() });

  assert.deepEqual(
    blocks.map((block) => block.kind === 'day-divider' ? { kind: block.kind, label: block.label } : { kind: block.kind, messageIndex: block.messageIndex, id: block.message.id }),
    [
      { kind: 'day-divider', label: '2026-03-11' },
      { kind: 'single', messageIndex: 0, id: 'message-1' },
      { kind: 'single', messageIndex: 1, id: 'message-2' },
      { kind: 'day-divider', label: '2026-03-12' },
      { kind: 'single', messageIndex: 2, id: 'message-3' },
    ],
  );
});

test('buildRenderBlocks hides compact timestamps only for consecutive rows from the same sender in the same minute', () => {
  const blocks = buildRenderBlocks([
    { id: 'message-1', networkId: 'network-1', target: '#help', nick: 'Joby', body: 'first', kind: 'line', self: false, ts: new Date(2026, 2, 11, 2, 57, 1, 0).getTime() },
    { id: 'message-2', networkId: 'network-1', target: '#help', nick: 'Joby', body: 'second', kind: 'line', self: false, ts: new Date(2026, 2, 11, 2, 57, 40, 0).getTime() },
    { id: 'message-3', networkId: 'network-1', target: '#help', nick: 'Joby', body: 'third', kind: 'line', self: false, ts: new Date(2026, 2, 11, 2, 58, 1, 0).getTime() },
    { id: 'message-4', networkId: 'network-1', target: '#help', nick: 'Ava', body: 'fourth', kind: 'line', self: false, ts: new Date(2026, 2, 11, 2, 58, 20, 0).getTime() },
  ]);

  assert.deepEqual(
    blocks.filter((block) => block.kind === 'single').map((block) => ({ id: block.message.id, hideTimestamp: block.hideTimestamp })),
    [
      { id: 'message-1', hideTimestamp: false },
      { id: 'message-2', hideTimestamp: true },
      { id: 'message-3', hideTimestamp: false },
      { id: 'message-4', hideTimestamp: false },
    ],
  );
});
