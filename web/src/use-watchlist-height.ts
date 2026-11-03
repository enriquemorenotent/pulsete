import { useLayoutEffect, useRef, useState } from 'react';

// Measure intrinsic channel content, not its scroll viewport: channels get first
// use of the sidebar, and the watchlist may consume whatever space is left.
export function useWatchlistHeight(activeNetworkId?: string) {
  const containerRef = useRef<HTMLDivElement>(null);
  const channelHeaderRef = useRef<HTMLElement>(null);
  const channelContentRef = useRef<HTMLDivElement>(null);
  const watchlistRef = useRef<HTMLElement>(null);
  const [availableHeight, setAvailableHeight] = useState(0);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const content = channelContentRef.current;
    const watchlist = watchlistRef.current;
    if (!container || !content || !watchlist) return;
    const update = () => {
      const list = watchlist.lastElementChild as HTMLElement;
      const chromeHeight = watchlist.offsetHeight
        - list.offsetHeight;
      setAvailableHeight(Math.max(0,
        container.clientHeight
        - (channelHeaderRef.current?.offsetHeight ?? 0)
        - content.offsetHeight
        - chromeHeight,
      ));
    };
    const observer = new ResizeObserver(update);
    observer.observe(container);
    observer.observe(content);
    observer.observe(watchlist);
    if (channelHeaderRef.current) observer.observe(channelHeaderRef.current);
    update();
    return () => observer.disconnect();
  }, [activeNetworkId]);

  return { containerRef, channelHeaderRef, channelContentRef, watchlistRef, availableHeight };
}
