import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseHideOfflineFriendsPreference,
} from '../web/src/useAppUiState.js';

test('parseHideOfflineFriendsPreference accepts only the persisted true value', () => {
  assert.equal(parseHideOfflineFriendsPreference('true'), true);
  assert.equal(parseHideOfflineFriendsPreference('false'), false);
  assert.equal(parseHideOfflineFriendsPreference(null), false);
  assert.equal(parseHideOfflineFriendsPreference('junk'), false);
});
