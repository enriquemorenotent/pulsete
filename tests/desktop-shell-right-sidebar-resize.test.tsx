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
  assert.doesNotMatch(markup, /aria-label="Expand right sidebar"/);
});

test('desktop shell replaces a collapsed right sidebar with an expand rail', () => {
  const markup = renderToStaticMarkup(
    <DesktopShellLayout
      {...createDesktopShellLayoutProps({
        rightSidebarCollapsed: true,
        rightSidebarKind: 'users',
        selectedBufferId: 'buffer-channel',
      })}
    />,
  );

  assert.match(markup, /aria-label="Resize left sidebar"/);
  assert.doesNotMatch(markup, /aria-label="Resize right sidebar"/);
  assert.match(markup, /class="hidden"><div>Details<\/div>/);
  assert.match(markup, /aria-label="Expand right sidebar"/);
});
