import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { createDesktopShellLayoutProps } from './desktop-shell-layout.fixture.js';
import { DesktopShellLayout } from '../web/src/DesktopShellLayout.js';

test('desktop shell keeps only the left resize handle when no right sidebar is available', () => {
  const markup = renderToStaticMarkup(
    <DesktopShellLayout
      {...createDesktopShellLayoutProps({
        rightSidebarKind: null,
        selectedBufferId: null,
      })}
    />,
  );

  assert.match(markup, /aria-label="Resize left sidebar"/);
  assert.doesNotMatch(markup, /aria-label="Resize right sidebar"/);
});

test('desktop shell renders a visible command palette trigger in the header', () => {
  const markup = renderToStaticMarkup(
    <DesktopShellLayout {...createDesktopShellLayoutProps()} />,
  );

  assert.match(markup, /Search Pulsete/);
  assert.match(markup, /aria-label="Search Pulsete"/);
  assert.match(markup, /Ctrl\/Cmd\+K/);
  assert.match(markup, /Logs/);
  assert.match(markup, /aria-label="Tools"/);
  assert.doesNotMatch(markup, />Preferences</);
  assert.doesNotMatch(markup, />Network Manager</);
});
