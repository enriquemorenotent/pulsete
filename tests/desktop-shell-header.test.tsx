import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { createDesktopShellLayoutProps } from './desktop-shell-layout.fixture.js';
import { DesktopShellLayout } from '../web/src/DesktopShellLayout.js';

test('desktop shell header avoids rendering any secondary context line', () => {
  const markup = renderToStaticMarkup(
    <DesktopShellLayout
      {...createDesktopShellLayoutProps({
        rightSidebarKind: 'users',
        selectedBufferId: 'buffer-channel',
      })}
    />,
  );

  assert.match(markup, />Pulsete</);
  assert.doesNotMatch(markup, /<p class="truncate pt-1 font-mono text-\[10px\] uppercase tracking-\[0\.22em\] text-muted-foreground">/);
});
