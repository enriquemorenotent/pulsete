import assert from 'node:assert/strict';
import test from 'node:test';
import { renderConnectionSidebar } from './helpers/connection-sidebar-test-helpers.js';

test('friends section can hide offline nicks while keeping online friends visible', () => {
  const markup = renderConnectionSidebar({
    friends: [
      { id: 'friend-1', nick: 'Alice' },
      { id: 'friend-2', nick: 'Bob' },
      { id: 'friend-3', nick: 'Cara' },
    ],
    friendPresence: {
      'friend-1': 'offline',
      'friend-2': 'away',
      'friend-3': 'online',
    },
    hideOfflineFriends: true,
  });

  assert.doesNotMatch(markup, /aria-label="Open Alice \(offline\)"/);
  assert.match(markup, /aria-label="Open Bob \(away\)"/);
  assert.match(markup, /aria-label="Open Cara \(online\)"/);
});

test('friends section shows an empty state when offline friends are hidden and none are online', () => {
  const markup = renderConnectionSidebar({
    friends: [
      { id: 'friend-1', nick: 'Alice' },
      { id: 'friend-2', nick: 'Bob' },
    ],
    friendPresence: {},
    hideOfflineFriends: true,
  });

  assert.match(markup, /No watched nicks are online right now\./);
  assert.doesNotMatch(markup, /aria-label="Open Alice \(offline\)"/);
  assert.doesNotMatch(markup, /aria-label="Open Bob \(offline\)"/);
});
