import assert from 'node:assert/strict';
import test from 'node:test';
import {
  NAVIGATION_LAYOUT_SETTINGS_STORAGE_KEY,
  parseNavigationLayoutSettings,
  serializeNavigationLayoutSettings,
} from '../web/src/navigation-layout-settings.js';

test('navigation layout settings default to all servers visible', () => {
  assert.deepEqual(parseNavigationLayoutSettings(null), {
    mode: 'all-servers-visible',
  });
  assert.deepEqual(parseNavigationLayoutSettings(''), {
    mode: 'all-servers-visible',
  });
});

test('navigation layout settings accept only known modes', () => {
  assert.deepEqual(
    parseNavigationLayoutSettings(JSON.stringify({ mode: 'server-rail' })),
    { mode: 'server-rail' },
  );
  assert.deepEqual(
    parseNavigationLayoutSettings(JSON.stringify({ mode: 'unknown' })),
    { mode: 'all-servers-visible' },
  );
  assert.deepEqual(parseNavigationLayoutSettings('not-json'), {
    mode: 'all-servers-visible',
  });
});

test('navigation layout settings serialize known mode values', () => {
  assert.equal(
    serializeNavigationLayoutSettings({ mode: 'server-rail' }),
    JSON.stringify({ mode: 'server-rail' }),
  );
  assert.equal(
    NAVIGATION_LAYOUT_SETTINGS_STORAGE_KEY,
    'pulsete.preferences.navigationLayout.v1',
  );
});
