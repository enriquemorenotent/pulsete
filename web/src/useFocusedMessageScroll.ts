import { useEffect, useRef } from 'react';

export const useFocusedMessageScroll = (focused: boolean | undefined) => {
  const rowRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (focused) {
      rowRef.current?.scrollIntoView({ block: 'center', behavior: 'auto' });
    }
  }, [focused]);

  return rowRef;
};
