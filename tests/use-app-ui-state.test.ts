import assert from 'node:assert/strict';
import test from 'node:test';
import {
  HIDE_OFFLINE_FRIENDS_STORAGE_KEY,
  parseHideOfflineFriendsPreference,
  persistHideOfflineFriendsPreference,
  readStoredHideOfflineFriendsPreference,
} from '../web/src/useAppUiState.js';

test('parseHideOfflineFriendsPreference accepts only the persisted true value', () => {
  assert.equal(parseHideOfflineFriendsPreference('true'), true);
  assert.equal(parseHideOfflineFriendsPreference('false'), false);
  assert.equal(parseHideOfflineFriendsPreference(null), false);
  assert.equal(parseHideOfflineFriendsPreference('junk'), false);
});

test('hide offline friends preference round-trips through browser-local storage', () => {
  const previousWindow = globalThis.window;
  const storage = new Map<string, string>();
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      localStorage: {
        getItem(key: string) {
          return storage.get(key) ?? null;
        },
        setItem(key: string, value: string) {
          storage.set(key, value);
        },
      },
    },
  });
  try {
    assert.equal(readStoredHideOfflineFriendsPreference(), false);
    persistHideOfflineFriendsPreference(true);
    assert.equal(
      storage.get(HIDE_OFFLINE_FRIENDS_STORAGE_KEY),
      'true',
    );
    assert.equal(readStoredHideOfflineFriendsPreference(), true);
    persistHideOfflineFriendsPreference(false);
    assert.equal(readStoredHideOfflineFriendsPreference(), false);
  } finally {
    if (previousWindow === undefined) {
      delete (globalThis as { window?: Window }).window;
    } else {
      Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: previousWindow,
      });
    }
  }
});
