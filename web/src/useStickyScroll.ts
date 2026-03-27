import { useEffect, useRef } from 'react';

type MutableRef<T> = { current: T };
type ScrollMetrics = Pick<HTMLDivElement, 'clientHeight' | 'scrollHeight' | 'scrollTop'>;
type ScrollContainer = Pick<
  HTMLDivElement,
  'addEventListener' | 'clientHeight' | 'removeEventListener' | 'scrollHeight' | 'scrollTop'
> & {
  dataset?: DOMStringMap;
};

const stickyScrollThresholdPx = 24;

type UseStickyScrollParams = {
  forceScrollToBottomRef?: MutableRef<(() => void) | null>;
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
    forceStickyScrollToBottom(node, stickToBottomRef);
  }, [params.scrollRef, params.selectedBufferId]);

  useEffect(() => {
    const node = params.scrollRef.current;
    if (!node) {
      return;
    }
    return bindStickyScrollTracking({
      node,
      stickToBottomRef,
    });
  }, [params.scrollRef, params.selectedBufferId]);

  useEffect(() => {
    const forceScrollToBottomRef = params.forceScrollToBottomRef;
    if (!forceScrollToBottomRef) {
      return;
    }
    const node = params.scrollRef.current;
    forceScrollToBottomRef.current =
      node
        ? () => {
            forceStickyScrollToBottom(node, stickToBottomRef);
          }
        : null;
    return () => {
      forceScrollToBottomRef.current = null;
    };
  }, [params.forceScrollToBottomRef, params.scrollRef, params.selectedBufferId]);
}

export const scrollNodeToBottom = (node: Pick<ScrollContainer, 'scrollHeight' | 'scrollTop'>) => {
  node.scrollTop = node.scrollHeight;
};

export const forceStickyScrollToBottom = (
  node: Pick<ScrollContainer, 'dataset' | 'scrollHeight' | 'scrollTop'>,
  stickToBottomRef: MutableRef<boolean>,
) => {
  scrollNodeToBottom(node);
  stickToBottomRef.current = true;
  syncStickyScrollMode(node, true);
};

export const isScrollNearBottom = (node: ScrollMetrics) =>
  node.scrollHeight - node.scrollTop - node.clientHeight <= stickyScrollThresholdPx;

export function bindStickyScrollTracking(params: {
  node: ScrollContainer;
  stickToBottomRef: MutableRef<boolean>;
}) {
  const updateStickiness = () => {
    const shouldStick = isScrollNearBottom(params.node);
    params.stickToBottomRef.current = shouldStick;
    syncStickyScrollMode(params.node, shouldStick);
  };

  updateStickiness();
  params.node.addEventListener('scroll', updateStickiness, { passive: true });

  return () => {
    params.node.removeEventListener('scroll', updateStickiness);
  };
}

const syncStickyScrollMode = (
  node: Pick<ScrollContainer, 'dataset'>,
  shouldStick: boolean,
) => {
  if (!node.dataset) {
    return;
  }
  node.dataset.stickyScroll = shouldStick ? 'pinned' : 'free';
};
