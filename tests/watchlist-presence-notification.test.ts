import assert from 'node:assert/strict';
import test from 'node:test';
import type { FriendState } from '../shared/protocol-chat.js';
import { NotificationOwner } from '../web/src/contact-notifications/notification-owner.js';
import {
  createWatchlistPresenceSnapshot,
  createWatchlistPresenceSystemNotification,
  findWatchlistPresenceNotifications,
  showWatchlistPresenceSystemNotification,
} from '../web/src/contact-notifications/friend-presence-notification.js';
import type { ContactSystemNotificationHandle } from '../web/src/contact-notifications/system-notification.js';
class FakeNotification {
  closeCalls = 0;
  onclick: ((event: Event) => void) | null = null;
  onclose: ((event: Event) => void) | null = null;

  constructor(
    readonly title: string,
    readonly options?: NotificationOptions,
  ) {}

  close() {
    this.closeCalls += 1;
    this.onclose?.(new Event('close'));
  }
}

const createNotificationOwner = () => new NotificationOwner<string, ContactSystemNotificationHandle>({
  close: (notification) => notification.close(),
});

const alice: FriendState = { id: 'friend-1', nick: 'Alice' };
const bob: FriendState = { id: 'friend-2', nick: 'Bob' };
const cara: FriendState = { id: 'friend-3', nick: 'Cara' };
const dion: FriendState = { id: 'friend-4', nick: 'Dion' };

test('watchlist presence notifications track offline and online boundaries', () => {
  const previousPresence = createWatchlistPresenceSnapshot(
    [alice, bob, cara],
    {
      [alice.id]: 'offline',
      [bob.id]: 'away',
      [cara.id]: 'online',
    },
  );

  const notifications = findWatchlistPresenceNotifications({
    previousPresence,
    friends: [alice, bob, cara, dion],
    friendPresence: {
      [alice.id]: 'away',
      [bob.id]: 'online',
      [cara.id]: 'offline',
      [dion.id]: 'online',
    },
  });

  assert.deepEqual(notifications, [
    { friend: alice, availability: 'online' },
    { friend: cara, availability: 'offline' },
  ]);
});

test('watchlist presence notification click focuses, selects, and clears handlers', () => {
  let focusCalls = 0;
  let selectedFriend: FriendState | null = null;
  const notification = createWatchlistPresenceSystemNotification({
    friend: alice,
    availability: 'online',
    focusWindow: () => {
      focusCalls += 1;
    },
    notificationConstructor: FakeNotification,
    onSelectFriend: (friend) => {
      selectedFriend = friend;
    },
  }) as FakeNotification;

  assert.equal(notification.title, 'Alice');
  assert.deepEqual(notification.options, {
    body: 'Alice is online',
    tag: 'pulsete-watchlist:friend-1',
  });

  notification.onclick?.(new Event('click'));

  assert.equal(focusCalls, 1);
  assert.equal(selectedFriend, alice);
  assert.equal(notification.closeCalls, 1);
  assert.equal(notification.onclick, null);
  assert.equal(notification.onclose, null);
});

test('watchlist presence dispatch tracks active notifications until release', () => {
  const notificationOwner = createNotificationOwner();

  showWatchlistPresenceSystemNotification({
    notification: { friend: alice, availability: 'offline' },
    notificationConstructor: FakeNotification,
    notificationOwner,
    onSelectFriend: () => undefined,
  });

  const notification = notificationOwner.get(alice.id) as FakeNotification;

  assert.equal(notificationOwner.size, 1);
  assert.deepEqual(notification?.options, {
    body: 'Alice is offline',
    tag: 'pulsete-watchlist:friend-1',
  });

  notification?.onclose?.(new Event('close'));

  assert.equal(notificationOwner.size, 0);
});

test('watchlist presence dispatch replaces an existing friend notification', () => {
  const notificationOwner = createNotificationOwner();

  showWatchlistPresenceSystemNotification({
    notification: { friend: alice, availability: 'offline' },
    notificationConstructor: FakeNotification,
    notificationOwner,
    onSelectFriend: () => undefined,
  });
  const previousNotification = notificationOwner.get(alice.id) as FakeNotification;

  showWatchlistPresenceSystemNotification({
    notification: { friend: alice, availability: 'online' },
    notificationConstructor: FakeNotification,
    notificationOwner,
    onSelectFriend: () => undefined,
  });
  const nextNotification = notificationOwner.get(alice.id) as FakeNotification;

  assert.equal(notificationOwner.size, 1);
  assert.equal(previousNotification?.closeCalls, 1);
  assert.equal(previousNotification?.onclick, null);
  assert.equal(previousNotification?.onclose, null);
  assert.deepEqual(nextNotification?.options, {
    body: 'Alice is online',
    tag: 'pulsete-watchlist:friend-1',
  });
  notificationOwner.closeAll();
});
