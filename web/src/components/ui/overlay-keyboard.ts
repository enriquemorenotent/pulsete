import type { KeyboardEvent } from 'react';

// Controls inside an overlay handle keys first. The workspace must not also
// act on those keys, and browser shortcuts must not navigate behind the overlay.
export function containOverlayKeyDown(event: KeyboardEvent<HTMLElement>) {
  event.stopPropagation();
  const palette = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k';
  const history = (event.altKey && ['ArrowLeft', 'ArrowRight'].includes(event.key))
    || (event.metaKey && ['BracketLeft', 'BracketRight'].includes(event.code));
  if (palette || history) event.preventDefault();
}
