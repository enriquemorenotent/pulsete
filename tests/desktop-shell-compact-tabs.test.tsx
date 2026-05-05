import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { createDesktopShellLayoutProps } from './desktop-shell-layout.fixture.js';
import { DesktopShellLayout } from '../web/src/DesktopShellLayout.js';

test('compact shell keeps workspace panes mounted while switching tabs', () => {
  const restore = installCompactViewport();
  try {
    const markup = renderToStaticMarkup(
      <DesktopShellLayout
        {...createDesktopShellLayoutProps({
          chat: <div>Chat pane stays mounted</div>,
          rightSidebar: <div>Details pane stays mounted</div>,
          rightSidebarKind: 'users',
          sidebar: <div>Browse pane stays mounted</div>,
        })}
      />,
    );

    assert.match(markup, /Browse pane stays mounted/);
    assert.match(markup, /Chat pane stays mounted/);
    assert.match(markup, /Details pane stays mounted/);
    assert.match(markup, /aria-hidden="false" class="absolute inset-0 min-h-0 overflow-hidden"><div>Chat pane stays mounted/);
    assert.match(markup, /aria-hidden="true" class="invisible pointer-events-none absolute inset-0 min-h-0 overflow-hidden"><div>Browse pane stays mounted/);
  } finally {
    restore();
  }
});

const installCompactViewport = () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      localStorage: {
        getItem: () => null,
        setItem: () => undefined,
      },
      matchMedia: () => ({
        addEventListener: () => undefined,
        matches: true,
        removeEventListener: () => undefined,
      }),
    },
  });

  return () => {
    if (descriptor) {
      Object.defineProperty(globalThis, 'window', descriptor);
      return;
    }
    delete (globalThis as { window?: unknown }).window;
  };
};
