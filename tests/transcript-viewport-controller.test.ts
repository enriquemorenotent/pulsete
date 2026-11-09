import assert from 'node:assert/strict';
import test from 'node:test';
import { TranscriptViewportController } from '../web/src/transcript/viewport-controller.js';

test('layout moving away from the bottom does not cancel following; user scroll-up does', () => {
  const controller = new TranscriptViewportController();
  controller.resolveScrollBoundary({ atTop: false, atBottom: false, hasNewerHistory: false });
  assert.equal(controller.shouldFollowLatest(false), true);
  controller.readHistory();
  assert.equal(controller.shouldFollowLatest(false), false);
  controller.requestHistory('newer');
  controller.resolveScrollBoundary({ atTop: false, atBottom: true, hasNewerHistory: true });
  assert.equal(controller.shouldFollowLatest(true), false);
  controller.requestHistory('newer');
  controller.resolveScrollBoundary({ atTop: false, atBottom: true, hasNewerHistory: false });
  assert.equal(controller.shouldFollowLatest(false), true);
});

test('restored anchors and message jumps suppress following until latest is requested', () => {
  const controller = new TranscriptViewportController();
  controller.restore({ kind: 'anchor', rowKey: 'message-20', offset: 13 });
  assert.deepEqual(controller.snapshot, { kind: 'anchor', rowKey: 'message-20', offset: 13 });
  assert.equal(controller.shouldFollowLatest(false), false);
  controller.jump('message-80');
  assert.deepEqual(controller.snapshot, { kind: 'anchor', rowKey: 'message-80' });
  assert.equal(controller.shouldFollowLatest(false), false);
  controller.followLatest();
  assert.deepEqual(controller.snapshot, { kind: 'latest' });
  assert.equal(controller.shouldFollowLatest(false), true);
});

test('a send keeps following through layout changes until the live window arrives', () => {
  const controller = new TranscriptViewportController();
  controller.readHistory();
  controller.followLatest(true);
  assert.equal(controller.shouldFollowLatest(true), true);
  controller.resolveScrollBoundary({ atTop: false, atBottom: false, hasNewerHistory: true });
  assert.equal(controller.shouldFollowLatest(true), true);
  controller.requestHistory('newer');
  controller.resolveScrollBoundary({ atTop: false, atBottom: true, hasNewerHistory: false });
  assert.equal(controller.shouldFollowLatest(false), true);
});

test('window replacement honors latest and message targets before an evicted anchor', () => {
  const controller = new TranscriptViewportController();
  const input = {
    previous: { rows: ['a', 'b', 'c'], hasNewerHistory: true, jumpToLatestRequestId: 0, focusRequestId: 0 },
    rowKeys: ['b', 'c', 'd'], hasNewerHistory: false, jumpToLatestRequestId: 0,
    focusRequestId: 1, focusRowIndex: 1, scroller: null,
  };
  assert.deepEqual(controller.resolveWindowChange(input), { index: 1, offset: 0, align: 'center' });
  assert.deepEqual(controller.resolveWindowChange({ ...input, jumpToLatestRequestId: 1 }), {
    index: 2, offset: 0, align: 'end',
  });
  assert.equal(controller.resolveWindowChange({ ...input, rowKeys: ['a', 'b', 'c', 'd'], focusRequestId: 0 }), null);
});


test('scrolling up cancels a pending send and all subsequent layout following', () => {
  const controller = new TranscriptViewportController();
  controller.followLatest(true);
  controller.requestHistory('older');
  assert.equal(controller.shouldFollowLatest(true), false);
  assert.equal(controller.shouldFollowLatest(false), false);
});

test('one boundary decision loads history or resumes live following only after user input', () => {
  const controller = new TranscriptViewportController();
  const bottom = { atTop: false, atBottom: true, hasNewerHistory: true };
  controller.readHistory();
  assert.equal(controller.resolveScrollBoundary(bottom), null);
  controller.resolveScrollBoundary({ ...bottom, hasNewerHistory: false });
  assert.equal(controller.shouldFollowLatest(false), false);
  controller.requestHistory('newer');
  assert.equal(controller.resolveScrollBoundary({ ...bottom, atBottom: false }), null);
  assert.equal(controller.resolveScrollBoundary(bottom), 'newer');
  assert.equal(controller.resolveScrollBoundary(bottom), null);
  assert.equal(controller.shouldFollowLatest(false), false);
  controller.requestHistory('newer');
  assert.equal(controller.resolveScrollBoundary({ ...bottom, hasNewerHistory: false }), null);
  assert.equal(controller.shouldFollowLatest(false), true);
  controller.requestHistory('older');
  assert.equal(controller.resolveScrollBoundary(bottom), null);
  assert.equal(controller.shouldFollowLatest(false), false);
  assert.equal(controller.resolveScrollBoundary({ ...bottom, atTop: true }), 'older');
});
