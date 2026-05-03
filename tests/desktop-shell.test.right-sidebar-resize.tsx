import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { createDesktopShellLayoutProps } from './desktop-shell-layout.fixture.js';
import { DesktopShellLayout } from '../web/src/DesktopShellLayout.js';

test('desktop shell renders a second resize handle when the right sidebar is visible', () => {
  const markup = renderToStaticMarkup(
    <DesktopShellLayout
      {...createDesktopShellLayoutProps({
        rightSidebarKind: 'users',
        selectedBufferId: 'buffer-channel',
      })}
    />,
  );

  assert.match(markup, /aria-label="Resize left sidebar"/);
  assert.match(markup, /aria-label="Resize right sidebar"/);
});
