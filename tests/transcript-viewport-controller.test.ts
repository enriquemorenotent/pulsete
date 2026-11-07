import assert from 'node:assert/strict';
import test from 'node:test';
import { TranscriptViewportController } from '../web/src/transcript/viewport-controller.js';

test('layout moving away from the bottom does not cancel following; user scroll-up does', () => {
  const controller = new TranscriptViewportController();
  controller.bottomChanged(false, false);
  assert.equal(controller.followOutput(false), 'auto');
  controller.readHistory();
  assert.equal(controller.followOutput(false), false);
  controller.bottomChanged(true, true);
  assert.equal(controller.followOutput(true), false);
  controller.bottomChanged(true, false);
  assert.equal(controller.followOutput(false), 'auto');
});

test('restored anchors and message jumps suppress following until latest is requested', () => {
  const controller = new TranscriptViewportController();
  controller.restore({ kind: 'anchor', rowKey: 'message-20', offset: 13 });
  assert.deepEqual(controller.snapshot, { kind: 'anchor', rowKey: 'message-20', offset: 13 });
  assert.equal(controller.followOutput(false), false);
  controller.jump('message-80');
  assert.deepEqual(controller.snapshot, { kind: 'anchor', rowKey: 'message-80' });
  assert.equal(controller.followOutput(false), false);
  controller.followLatest();
  assert.deepEqual(controller.snapshot, { kind: 'latest' });
  assert.equal(controller.followOutput(false), 'auto');
});

test('a send requests following once even while the old history window is present', () => {
  const controller = new TranscriptViewportController();
  controller.readHistory();
  controller.followLatest(true);
  assert.equal(controller.shouldFollowPreview, true);
  assert.equal(controller.followOutput(true), 'auto');
  assert.equal(controller.followOutput(true), false);
  assert.equal(controller.followOutput(false), 'auto');
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
