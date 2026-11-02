import type { ComponentProps, MouseEvent } from 'react';
export const externalLinkWarning = 'This link opens in your browser, outside this account’s VPN connection. The website may see your browser’s IP address and cookies. Open it?';
export function ExternalLink({ onClick, onAuxClick, ...props }: ComponentProps<'a'>) {
  const confirm = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!/^https?:/i.test(props.href ?? '')) return true;
    // Electron confirms in the main process, including new-window/context-menu navigation.
    if (/Electron\//.test(navigator.userAgent)) return true;
    if (window.confirm(externalLinkWarning)) return true;
    event.preventDefault();
    return false;
  };
  return <a {...props} onClick={event => { if (confirm(event)) onClick?.(event); }} onAuxClick={event => { if (event.button === 1 && !confirm(event)) return; onAuxClick?.(event); }} />;
}
