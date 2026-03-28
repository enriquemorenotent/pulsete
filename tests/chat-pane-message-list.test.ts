import assert from 'node:assert/strict';
import test from 'node:test';
import {
  restoreScrollOffsetAfterPrepend,
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
