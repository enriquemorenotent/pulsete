import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MEDIA_VISIBILITY_SETTINGS_STORAGE_KEY,
  parseMediaVisibilitySettings,
} from '../web/src/media-visibility-settings.js';

test('media visibility settings default to showing media', () => {
  assert.deepEqual(parseMediaVisibilitySettings(null), { mode: 'show-media' });
  assert.deepEqual(parseMediaVisibilitySettings(''), { mode: 'show-media' });
});

test('media visibility settings accept only known modes', () => {
  assert.deepEqual(
    parseMediaVisibilitySettings(JSON.stringify({ mode: 'hide-media' })),
    { mode: 'hide-media' },
  );
  assert.deepEqual(
    parseMediaVisibilitySettings(JSON.stringify({ mode: 'unknown' })),
    { mode: 'show-media' },
  );
  assert.deepEqual(parseMediaVisibilitySettings('not-json'), { mode: 'show-media' });
});

test('media visibility settings retain their legacy storage key', () => {
  assert.equal(
    MEDIA_VISIBILITY_SETTINGS_STORAGE_KEY,
    'pulsete.preferences.mediaVisibility.v1',
  );
});
