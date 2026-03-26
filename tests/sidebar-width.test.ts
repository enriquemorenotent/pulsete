import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_SIDEBAR_WIDTH,
  MAX_SIDEBAR_WIDTH,
  MIN_SIDEBAR_WIDTH,
  clampSidebarWidth,
  getSidebarResizeDeltaForKey,
  readSidebarWidth,
  resolveDraggedSidebarWidth,
  SIDEBAR_WIDTH_STEP,
} from '../web/src/sidebar-width.js';

test('sidebar width clamps within bounds and rounds to pixels', () => {
  assert.equal(clampSidebarWidth(MIN_SIDEBAR_WIDTH - 40), MIN_SIDEBAR_WIDTH);
  assert.equal(clampSidebarWidth(MAX_SIDEBAR_WIDTH + 40), MAX_SIDEBAR_WIDTH);
  assert.equal(clampSidebarWidth(255.6), 256);
});

test('sidebar width falls back to the default for invalid stored values', () => {
  assert.equal(readSidebarWidth(null), DEFAULT_SIDEBAR_WIDTH);
  assert.equal(readSidebarWidth('abc'), DEFAULT_SIDEBAR_WIDTH);
  assert.equal(readSidebarWidth(String(MAX_SIDEBAR_WIDTH + 25)), MAX_SIDEBAR_WIDTH);
});

test('dragging measures sidebar width from the active screen edge', () => {
  const bounds = { left: 100, right: 900 };

  assert.equal(resolveDraggedSidebarWidth('left', 356, bounds), 256);
  assert.equal(resolveDraggedSidebarWidth('right', 644, bounds), 256);
  assert.equal(resolveDraggedSidebarWidth('right', 1200, bounds), MIN_SIDEBAR_WIDTH);
});

test('keyboard resize arrows follow the sidebar edge direction', () => {
  assert.equal(getSidebarResizeDeltaForKey('left', 'ArrowLeft'), -SIDEBAR_WIDTH_STEP);
  assert.equal(getSidebarResizeDeltaForKey('left', 'ArrowRight'), SIDEBAR_WIDTH_STEP);
  assert.equal(getSidebarResizeDeltaForKey('right', 'ArrowLeft'), SIDEBAR_WIDTH_STEP);
  assert.equal(getSidebarResizeDeltaForKey('right', 'ArrowRight'), -SIDEBAR_WIDTH_STEP);
  assert.equal(getSidebarResizeDeltaForKey('right', 'Enter'), null);
});
