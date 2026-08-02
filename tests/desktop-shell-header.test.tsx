import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { createDesktopShellLayoutProps } from './desktop-shell-layout.fixture.js';
import { DesktopShellLayout } from '../web/src/DesktopShellLayout.js';
import {
  DesktopShellBrand,
  resolveApplicationEnvironment,
} from '../web/src/DesktopShellBrand.js';

test('desktop shell header avoids rendering any secondary context line', () => {
  const markup = renderToStaticMarkup(
    <DesktopShellLayout
      {...createDesktopShellLayoutProps({
        rightSidebarKind: 'users',
        selectedBufferId: 'buffer-channel',
      })}
    />,
  );

  assert.match(markup, /src="\/pulsete-logo.svg"/);
  assert.match(markup, /alt="Pulsete"/);
  assert.doesNotMatch(markup, />Pulsete</);
  assert.doesNotMatch(markup, />IRC</);
  assert.doesNotMatch(markup, /<p class="truncate pt-1 font-mono text-\[10px\] uppercase tracking-\[0\.22em\] text-muted-foreground">/);
});

test('desktop shell brand labels development and keeps production unbadged', () => {
  const developmentMarkup = renderToStaticMarkup(
    <DesktopShellBrand environment="development" />,
  );
  const productionMarkup = renderToStaticMarkup(
    <DesktopShellBrand environment="production" />,
  );

  assert.match(developmentMarkup, /aria-label="Development environment"/);
  assert.match(developmentMarkup, />DEV</);
  assert.match(developmentMarkup, /border-amber-400/);
  assert.match(productionMarkup, /alt="Pulsete"/);
  assert.doesNotMatch(productionMarkup, /aria-label="[^"]+ environment"/);
  assert.doesNotMatch(productionMarkup, />DEV</);
  assert.doesNotMatch(productionMarkup, />PROD</);
});

test('desktop shell only labels builds as production when Vite explicitly does so', () => {
  assert.equal(resolveApplicationEnvironment({ PROD: true }), 'production');
  assert.equal(resolveApplicationEnvironment({ PROD: false }), 'development');
  assert.equal(resolveApplicationEnvironment(), 'development');
});
