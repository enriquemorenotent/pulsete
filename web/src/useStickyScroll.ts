import { useEffect, useRef } from 'react';

type MutableRef<T> = { current: T };
type ScrollMetrics = Pick<HTMLDivElement, 'clientHeight' | 'scrollHeight' | 'scrollTop'>;
type ScrollContainer = Pick<
  HTMLDivElement,
  'addEventListener' | 'clientHeight' | 'firstElementChild' | 'removeEventListener' | 'scrollHeight' | 'scrollTop'
>;
type ResizeObserverLike = {
  observe: (target: Element) => void;
  disconnect: () => void;
};
type ResizeObserverFactory = ((callback: () => void) => ResizeObserverLike) | null;

const stickyScrollThresholdPx = 24;

type UseStickyScrollParams = {
  scrollRef: MutableRef<HTMLDivElement | null>;
  selectedBufferId: string | undefined;
};

export function useStickyScroll(params: UseStickyScrollParams) {
  const stickToBottomRef = useRef(true);

  useEffect(() => {
    const node = params.scrollRef.current;
    if (!node) {
      return;
    }
    stickToBottomRef.current = true;
    scrollNodeToBottom(node);
  }, [params.scrollRef, params.selectedBufferId]);

  useEffect(() => {
    const node = params.scrollRef.current;
    if (!node) {
      return;
    }
    stickToBottomRef.current = true;
    return bindStickyScrollTracking({ node, stickToBottomRef, createResizeObserver: createResizeObserverFactory() });
  }, [params.scrollRef, params.selectedBufferId]);
}

export const scrollNodeToBottom = (node: Pick<ScrollContainer, 'scrollHeight' | 'scrollTop'>) => {
  node.scrollTop = node.scrollHeight;
};

export const isScrollNearBottom = (node: ScrollMetrics) =>
  node.scrollHeight - node.scrollTop - node.clientHeight <= stickyScrollThresholdPx;

export const createResizeObserverFactory = (): ResizeObserverFactory =>
  typeof ResizeObserver === 'undefined'
    ? null
    : (callback) =>
        new ResizeObserver(() => {
          callback();
        });

export function bindStickyScrollTracking(params: {
  node: ScrollContainer;
  stickToBottomRef: MutableRef<boolean>;
  createResizeObserver: ResizeObserverFactory;
}) {
  const updateStickiness = () => {
    params.stickToBottomRef.current = isScrollNearBottom(params.node);
  };

  updateStickiness();
  params.node.addEventListener('scroll', updateStickiness, { passive: true });

  const content = params.node.firstElementChild;
  const resizeObserver =
    content && params.createResizeObserver
      ? params.createResizeObserver(() => {
          if (!params.stickToBottomRef.current) {
            return;
          }
          scrollNodeToBottom(params.node);
          params.stickToBottomRef.current = true;
        })
      : null;

  if (content && resizeObserver) {
    resizeObserver.observe(content);
  }

  return () => {
    params.node.removeEventListener('scroll', updateStickiness);
    resizeObserver?.disconnect();
  };
}
