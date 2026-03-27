import assert from 'node:assert/strict';
import test from 'node:test';
import {
  bindStickyScrollTracking,
  forceStickyScrollToBottom,
  isScrollNearBottom,
  scrollNodeToBottom,
} from '../web/src/useStickyScroll.js';

type ScrollListener = () => void;

const createScrollNode = (overrides: Partial<{
  clientHeight: number;
  scrollHeight: number;
  scrollTop: number;
}> = {}) => {
  let scrollListener: ScrollListener | null = null;
  return {
    node: {
      clientHeight: overrides.clientHeight ?? 120,
      dataset: {} as DOMStringMap,
      scrollHeight: overrides.scrollHeight ?? 420,
      scrollTop: overrides.scrollTop ?? 0,
      addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
        if (type === 'scroll' && typeof listener === 'function') {
          scrollListener = listener as ScrollListener;
        }
      },
      removeEventListener(type: string, listener: EventListenerOrEventListenerObject) {
        if (type === 'scroll' && listener === scrollListener) {
          scrollListener = null;
        }
      },
    },
    emitScroll() {
      scrollListener?.();
    },
  };
};

test('scroll helpers detect bottom anchoring and scroll to the end', () => {
  const { node } = createScrollNode({ clientHeight: 100, scrollHeight: 400, scrollTop: 278 });

  assert.equal(isScrollNearBottom(node), true);
  scrollNodeToBottom(node);
  assert.equal(node.scrollTop, 400);
});

test('sticky scroll tracking marks the container as pinned while near the bottom', () => {
  const { node } = createScrollNode({ clientHeight: 100, scrollHeight: 400, scrollTop: 400 });
  const stickToBottomRef = { current: false };

  const cleanup = bindStickyScrollTracking({
    node,
    stickToBottomRef,
  });

  assert.equal(stickToBottomRef.current, true);
  assert.equal(node.dataset.stickyScroll, 'pinned');

  cleanup();
});

test('sticky scroll tracking switches to free mode after the user scrolls up', () => {
  const { node, emitScroll } = createScrollNode({ clientHeight: 100, scrollHeight: 400, scrollTop: 400 });
  const stickToBottomRef = { current: true };

  const cleanup = bindStickyScrollTracking({
    node,
    stickToBottomRef,
  });

  node.scrollTop = 180;
  emitScroll();

  assert.equal(stickToBottomRef.current, false);
  assert.equal(node.dataset.stickyScroll, 'free');

  cleanup();
});

test('sticky scroll tracking returns to pinned mode when the user reaches the bottom again', () => {
  const { node, emitScroll } = createScrollNode({ clientHeight: 100, scrollHeight: 400, scrollTop: 180 });
  const stickToBottomRef = { current: false };

  const cleanup = bindStickyScrollTracking({
    node,
    stickToBottomRef,
  });

  node.scrollTop = 400;
  emitScroll();

  assert.equal(stickToBottomRef.current, true);
  assert.equal(node.dataset.stickyScroll, 'pinned');

  cleanup();
});

test('forceStickyScrollToBottom snaps to the end and restores pinned mode', () => {
  const { node } = createScrollNode({ clientHeight: 100, scrollHeight: 560, scrollTop: 180 });
  const stickToBottomRef = { current: false };

  forceStickyScrollToBottom(node, stickToBottomRef);

  assert.equal(node.scrollTop, 560);
  assert.equal(stickToBottomRef.current, true);
  assert.equal(node.dataset.stickyScroll, 'pinned');
});
