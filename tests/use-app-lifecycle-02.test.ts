import assert from 'node:assert/strict';
import test from 'node:test';
import {
  bindStickyScrollTracking,
  forceStickyScrollToBottom,
  isScrollNearBottom,
  scrollNodeToBottom,
} from '../web/src/useStickyScroll.js';

type ScrollListener = () => void;
type MutationListener = () => void;

const createScrollNode = (overrides: Partial<{
  clientHeight: number;
  scrollHeight: number;
  scrollTop: number;
  firstElementChild: Element | null;
  lastElementChild: Element | null;
}> = {}) => {
  let scrollListener: ScrollListener | null = null;
  let mutationListener: MutationListener | null = null;
  return {
    node: {
      clientHeight: overrides.clientHeight ?? 120,
      scrollHeight: overrides.scrollHeight ?? 420,
      scrollTop: overrides.scrollTop ?? 0,
      firstElementChild: overrides.firstElementChild ?? ({} as Element),
      lastElementChild: overrides.lastElementChild ?? overrides.firstElementChild ?? ({} as Element),
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
    setMutationListener(listener: MutationListener | null) {
      mutationListener = listener;
    },
    emitMutation() {
      mutationListener?.();
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
  const { node, setMutationListener } = createScrollNode({ clientHeight: 100, scrollHeight: 400, scrollTop: 400 });
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
    createMutationObserver: (callback) => {
      setMutationListener(callback);
      return {
        observe() {},
        disconnect() {
          setMutationListener(null);
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

test('sticky scroll tracking observes the transcript content instead of leading chrome', () => {
  const toolbar = {} as Element;
  const transcript = {} as Element;
  const { node, setMutationListener } = createScrollNode({
    clientHeight: 100,
    scrollHeight: 400,
    scrollTop: 400,
    firstElementChild: toolbar,
    lastElementChild: transcript,
  });
  const stickToBottomRef = { current: true };
  let observedTarget: Element | null = null;
  let resizeCallback: (() => void) | null = null;

  const cleanup = bindStickyScrollTracking({
    node,
    stickToBottomRef,
    createResizeObserver: (callback) => {
      resizeCallback = callback;
      return {
        observe(target) {
          observedTarget = target;
        },
        disconnect() {},
      };
    },
    createMutationObserver: (callback) => {
      setMutationListener(callback);
      return {
        observe() {},
        disconnect() {
          setMutationListener(null);
        },
      };
    },
  });

  assert.equal(observedTarget, transcript);
  node.scrollHeight = 560;
  const runResize = resizeCallback ?? (() => {
    throw new Error('Missing resize callback');
  });
  runResize();
  assert.equal(node.scrollTop, 560);

  cleanup();
});

test('sticky scroll tracking stops forcing the bottom after the user scrolls up', () => {
  const { node, emitScroll, setMutationListener } = createScrollNode({ clientHeight: 100, scrollHeight: 400, scrollTop: 400 });
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
    createMutationObserver: (callback) => {
      setMutationListener(callback);
      return {
        observe() {},
        disconnect() {
          setMutationListener(null);
        },
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

test('sticky scroll tracking rebinds when the transcript root changes after mount', () => {
  const emptyState = {} as Element;
  const transcript = {} as Element;
  const { node, emitMutation, setMutationListener } = createScrollNode({
    clientHeight: 100,
    scrollHeight: 120,
    scrollTop: 120,
    firstElementChild: emptyState,
    lastElementChild: emptyState,
  });
  const stickToBottomRef = { current: true };
  let observedTarget: Element | null = null;
  let resizeCallback: (() => void) | null = null;

  const cleanup = bindStickyScrollTracking({
    node,
    stickToBottomRef,
    createResizeObserver: (callback) => {
      resizeCallback = callback;
      return {
        observe(target) {
          observedTarget = target;
        },
        disconnect() {},
      };
    },
    createMutationObserver: (callback) => {
      setMutationListener(callback);
      return {
        observe() {},
        disconnect() {
          setMutationListener(null);
        },
      };
    },
  });

  assert.equal(observedTarget, emptyState);

  node.firstElementChild = transcript;
  node.lastElementChild = transcript;
  node.scrollHeight = 360;
  emitMutation();

  assert.equal(observedTarget, transcript);
  assert.equal(node.scrollTop, 360);

  node.scrollHeight = 520;
  const runResize = resizeCallback ?? (() => {
    throw new Error('Missing resize callback');
  });
  runResize();

  assert.equal(node.scrollTop, 520);

  cleanup();
});

test('sticky scroll tracking stays pinned when top chrome appears later', () => {
  const transcript = {} as Element;
  const toolbar = {} as Element;
  const { node, emitMutation, setMutationListener } = createScrollNode({
    clientHeight: 100,
    scrollHeight: 400,
    scrollTop: 400,
    firstElementChild: transcript,
    lastElementChild: transcript,
  });
  const stickToBottomRef = { current: true };

  const cleanup = bindStickyScrollTracking({
    node,
    stickToBottomRef,
    createResizeObserver: () => ({
      observe() {},
      disconnect() {},
    }),
    createMutationObserver: (callback) => {
      setMutationListener(callback);
      return {
        observe() {},
        disconnect() {
          setMutationListener(null);
        },
      };
    },
  });

  node.firstElementChild = toolbar;
  node.lastElementChild = transcript;
  node.scrollHeight = 448;
  emitMutation();

  assert.equal(node.scrollTop, 448);
  assert.equal(stickToBottomRef.current, true);

  cleanup();
});

test('sticky scroll tracking keeps manual scroll-up even when the transcript root changes', () => {
  const firstTranscript = {} as Element;
  const nextTranscript = {} as Element;
  const { node, emitMutation, emitScroll, setMutationListener } = createScrollNode({
    clientHeight: 100,
    scrollHeight: 420,
    scrollTop: 420,
    firstElementChild: firstTranscript,
    lastElementChild: firstTranscript,
  });
  const stickToBottomRef = { current: true };

  const cleanup = bindStickyScrollTracking({
    node,
    stickToBottomRef,
    createResizeObserver: () => ({
      observe() {},
      disconnect() {},
    }),
    createMutationObserver: (callback) => {
      setMutationListener(callback);
      return {
        observe() {},
        disconnect() {
          setMutationListener(null);
        },
      };
    },
  });

  node.scrollTop = 180;
  emitScroll();
  node.firstElementChild = nextTranscript;
  node.lastElementChild = nextTranscript;
  node.scrollHeight = 560;
  emitMutation();

  assert.equal(stickToBottomRef.current, false);
  assert.equal(node.scrollTop, 180);

  cleanup();
});
