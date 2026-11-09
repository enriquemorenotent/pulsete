import { useEffect } from 'react';
import type { Action, Banner } from './app-types.js';

export function useBannerDismissal(banner: Banner, dispatch: (action: Action) => void) {
  useEffect(() => {
    if (!banner || banner.dismissAfterMs === null) return;
    const timer = window.setTimeout(
      () => dispatch({ type: 'set-banner', banner: null }),
      banner.dismissAfterMs,
    );
    return () => window.clearTimeout(timer);
  }, [banner, dispatch]);
}
