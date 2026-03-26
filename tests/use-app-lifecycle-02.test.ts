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
  firstElementChild: Element | null;
}> = {}) => {
  let scrollListener: ScrollListener | null = null;
  return {
    node: {
      clientHeight: overrides.clientHeight ?? 120,
      scrollHeight: overrides.scrollHeight ?? 420,
      scrollTop: overrides.scrollTop ?? 0,
      firstElementChild: overrides.firstElementChild ?? ({} as Element),
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

test('sticky scroll tracking keeps the view pinned when content grows at the bottom', () => {
  const { node } = createScrollNode({ clientHeight: 100, scrollHeight: 400, scrollTop: 400 });
  const stickToBottomRef = { current: true };
  let resizeCallback: (() => void) | null = null;
  let disconnected = false;

  const cleanup = bindStickyScrollTracking({
    node,
    stickToBottomRef,
    createResizeObserver: (callback) => {
      resizeCallback = callback;
      return {
        observe() {},
        disconnect() {
          disconnected = true;
        },
      };
    },
  });

  node.scrollHeight = 560;
  const runResize = resizeCallback ?? (() => {
    throw new Error('Missing resize callback');
  });
  runResize();

  assert.equal(node.scrollTop, 560);
  assert.equal(stickToBottomRef.current, true);

  cleanup();
  assert.equal(disconnected, true);
});

test('sticky scroll tracking stops forcing the bottom after the user scrolls up', () => {
  const { node, emitScroll } = createScrollNode({ clientHeight: 100, scrollHeight: 400, scrollTop: 400 });
  const stickToBottomRef = { current: true };
  let resizeCallback: (() => void) | null = null;

  const cleanup = bindStickyScrollTracking({
    node,
    stickToBottomRef,
    createResizeObserver: (callback) => {
      resizeCallback = callback;
      return {
        observe() {},
        disconnect() {},
      };
    },
  });

  node.scrollTop = 180;
  emitScroll();
  node.scrollHeight = 560;
  const runResize = resizeCallback ?? (() => {
    throw new Error('Missing resize callback');
  });
  runResize();

  assert.equal(stickToBottomRef.current, false);
  assert.equal(node.scrollTop, 180);

  cleanup();
});

test('forceStickyScrollToBottom snaps to the end and restores stickiness', () => {
  const { node } = createScrollNode({ clientHeight: 100, scrollHeight: 560, scrollTop: 180 });
  const stickToBottomRef = { current: false };

  forceStickyScrollToBottom(node, stickToBottomRef);

  assert.equal(node.scrollTop, 560);
  assert.equal(stickToBottomRef.current, true);
});
