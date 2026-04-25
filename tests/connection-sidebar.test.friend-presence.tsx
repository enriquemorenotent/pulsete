import assert from 'node:assert/strict';
import test from 'node:test';
import { renderConnectionSidebar } from './helpers/connection-sidebar-test-helpers.js';

test('friend rows expose online and away cues when the rail defaults open', () => {
  const friend = { id: 'friend-1', nick: 'Alice' };
  const markup = renderConnectionSidebar({
    friends: [friend],
    friendPresence: { [friend.id]: 'away' },
  });

  assert.match(markup, /Watchlist<\/h2>/);
  assert.doesNotMatch(markup, />1 online</);
  assert.match(markup, /aria-label="Open Alice \(away\)"/);
  assert.match(markup, /bg-yellow-400/);
});

test('friends sort online contacts above away, then offline', () => {
  const markup = renderConnectionSidebar({
    friends: [
      { id: 'friend-2', nick: 'Mira' },
      { id: 'friend-1', nick: 'Alice' },
      { id: 'friend-3', nick: 'Bea' },
    ],
    friendPresence: {
      'friend-1': 'offline',
      'friend-2': 'online',
      'friend-3': 'away',
    },
  });

  const miraIndex = markup.indexOf('aria-label="Open Mira (online)"');
  const beaIndex = markup.indexOf('aria-label="Open Bea (away)"');
  const aliceIndex = markup.indexOf('aria-label="Open Alice (offline)"');

  assert.notEqual(miraIndex, -1);
  assert.notEqual(beaIndex, -1);
  assert.notEqual(aliceIndex, -1);
  assert.ok(miraIndex < beaIndex);
  assert.ok(beaIndex < aliceIndex);
});

test('friends header includes an overflow menu button', () => {
  const markup = renderConnectionSidebar({
    friends: [
      { id: 'friend-1', nick: 'Alice' },
      { id: 'friend-2', nick: 'Bob' },
    ],
  });

  assert.match(markup, /Watchlist<\/h2>/);
  assert.match(markup, /aria-label="Watchlist options"/);
  assert.match(markup, /aria-haspopup="menu"/);
});
