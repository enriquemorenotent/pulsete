import assert from 'node:assert/strict';
import test from 'node:test';
import {
  restoreScrollOffsetAfterPrepend,
  shouldAutoLoadOlderHistory,
} from '../web/src/ChatPaneMessageList.js';

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
