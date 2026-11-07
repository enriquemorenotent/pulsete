import assert from 'node:assert/strict';
import test from 'node:test';
import { captureTranscriptScrollSnapshot } from '../web/src/transcript/capture-scroll-snapshot.js';
import { resolveRestoredTranscriptScrollIndex } from '../web/src/transcript/viewport-positioning.js';

function scroller(gap: number) {
  return {
    scrollHeight: 2000, clientHeight: 500, scrollTop: 1500 - gap,
    getBoundingClientRect: () => ({ top: 100, bottom: 600 }),
    querySelectorAll: () => [
      { dataset: { index: '0' }, getBoundingClientRect: () => ({ top: -60, bottom: 40 }) },
      { dataset: { index: '1' }, getBoundingClientRect: () => ({ top: 40, bottom: 100 }) },
      { dataset: { index: '2' }, getBoundingClientRect: () => ({ top: 100, bottom: 160 }) },
    ],
  } as unknown as HTMLElement;
}

test('returning from a nearly-bottom view follows the latest messages', () => {
  assert.deepEqual(captureTranscriptScrollSnapshot(scroller(10), ['a', 'b', 'c'], false), { kind: 'latest' });
});

test('scroll snapshot skips off-screen rendered rows', () => {
  assert.deepEqual(captureTranscriptScrollSnapshot(scroller(300), ['a', 'b', 'c'], false), {
    kind: 'anchor', rowKey: 'c', offset: 0,
  });
});

test('scroll snapshot preserves a partially visible row and its offset', () => {
  const node = scroller(300);
  node.getBoundingClientRect = () => ({ top: 120, bottom: 620 }) as DOMRect;
  const snapshot = captureTranscriptScrollSnapshot(node, ['a', 'b', 'c'], false);
  assert.deepEqual(snapshot, { kind: 'anchor', rowKey: 'c', offset: 20 });
  assert.deepEqual(resolveRestoredTranscriptScrollIndex({firstItemIndex: 0, rowKeys: ['new', 'a', 'b', 'c'], snapshot}), {
    align: 'start', behavior: 'auto', index: 3, offset: 20,
  });
});

test('the bottom of an older history window remains an anchor', () => {
  assert.deepEqual(captureTranscriptScrollSnapshot(scroller(0), ['a', 'b', 'c'], true), {
    kind: 'anchor', rowKey: 'c', offset: 0,
  });
});
