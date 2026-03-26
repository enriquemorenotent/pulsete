import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldSubmitAddFriendDialog } from '../web/src/AddFriendDialog.js';

const makeEvent = (
  overrides: Partial<Parameters<typeof shouldSubmitAddFriendDialog>[0]> = {},
) => ({
  key: overrides.key ?? 'Enter',
  nativeEvent: overrides.nativeEvent ?? { isComposing: false },
});

test('add-friend dialog submits on Enter', () => {
  assert.equal(shouldSubmitAddFriendDialog(makeEvent()), true);
});

test('add-friend dialog does not submit while composing IME text', () => {
  assert.equal(shouldSubmitAddFriendDialog(makeEvent({ nativeEvent: { isComposing: true } })), false);
});
