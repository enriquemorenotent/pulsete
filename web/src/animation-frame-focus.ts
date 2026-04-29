import type { RefObject } from 'react';

type AnimationFrameScheduler = Pick<Window, 'cancelAnimationFrame' | 'requestAnimationFrame'>;

type FocusTarget = {
  focus: () => void;
};

export const scheduleAnimationFrameFocus = (
  scheduler: AnimationFrameScheduler,
  inputRef: RefObject<FocusTarget | null>,
) => {
  const frame = scheduler.requestAnimationFrame(() => {
    inputRef.current?.focus();
  });
  return () => scheduler.cancelAnimationFrame(frame);
};
