import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MEDIA_VISIBILITY_SETTINGS_STORAGE_KEY,
  parseMediaVisibilitySettings,
  resolveMediaVisibilityPolicy,
  serializeMediaVisibilitySettings,
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

test('media visibility settings serialize known mode values', () => {
  assert.equal(
    serializeMediaVisibilitySettings({ mode: 'hide-media' }),
    JSON.stringify({ mode: 'hide-media' }),
  );
  assert.equal(
    MEDIA_VISIBILITY_SETTINGS_STORAGE_KEY,
    'pulsete.preferences.mediaVisibility.v1',
  );
});

test('media visibility policy disables passive media in hide media mode', () => {
  assert.deepEqual(resolveMediaVisibilityPolicy({ mode: 'hide-media' }), {
    mode: 'hide-media',
    showChatMediaPreviews: false,
    showCommandPaletteImages: false,
    showExternalMedia: false,
    showNotificationIcons: false,
    showProfileImages: false,
    showServerImages: false,
    showUserAvatars: false,
  });
});
