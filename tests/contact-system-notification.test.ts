import assert from 'node:assert/strict';
import test from 'node:test';
import type { BufferState } from '../shared/protocol-chat.js';
import {
  closeContactSystemNotification,
  createContactSystemNotification,
  showContactSystemNotification,
  type ContactSystemNotificationHandle,
} from '../web/src/contact-notifications/system-notification.js';

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

const buffer: BufferState = {
  id: 'query-alice',
  networkId: 'network-1',
  kind: 'query',
  target: 'Alice',
  unread: 1,
  priorityUnread: 1,
  lastReadTs: null,
  lastReadMessageId: null,
};

test('system notification reports release when browser-owned handlers are cleared', () => {
  const released: FakeNotification[] = [];
  const notification = createContactSystemNotification({
    buffer,
    networkName: 'ExampleNet',
    notificationConstructor: FakeNotification,
    onRelease: (releasedNotification) => {
      released.push(releasedNotification as FakeNotification);
    },
    onSelectBuffer: () => undefined,
  }) as FakeNotification;

  notification.onclose?.(new Event('close'));
  notification.onclose?.(new Event('close'));

  assert.deepEqual(released, [notification]);
  assert.equal(notification.onclick, null);
  assert.equal(notification.onclose, null);
});

test('system notification click focuses, selects, and clears handlers', () => {
  let focusCalls = 0;
  let selectedBuffer: BufferState | null = null;
  const notification = createContactSystemNotification({
    buffer,
    focusWindow: () => {
      focusCalls += 1;
    },
    networkName: 'ExampleNet',
    notificationConstructor: FakeNotification,
    onSelectBuffer: (nextBuffer) => {
      selectedBuffer = nextBuffer;
    },
  }) as FakeNotification;

  assert.equal(notification.title, 'Alice');
  assert.deepEqual(notification.options, {
    body: 'New private message on ExampleNet',
    tag: 'pulsete-dm:query-alice',
  });

  notification.onclick?.(new Event('click'));

  assert.equal(focusCalls, 1);
  assert.equal(selectedBuffer, buffer);
  assert.equal(notification.closeCalls, 1);
  assert.equal(notification.onclick, null);
  assert.equal(notification.onclose, null);
});

test('system notification can use the query custom avatar as its icon', () => {
  const notification = createContactSystemNotification({
    avatarIconUrl: 'data:image/png;base64,custom',
    buffer,
    networkName: 'ExampleNet',
    notificationConstructor: FakeNotification,
    onSelectBuffer: () => undefined,
  }) as FakeNotification;

  assert.deepEqual(notification.options, {
    body: 'New private message on ExampleNet',
    icon: 'data:image/png;base64,custom',
    tag: 'pulsete-dm:query-alice',
  });
});

test('system notification labels channel messages with a channel tag', () => {
  const channelBuffer: BufferState = {
    ...buffer,
    id: 'channel-help',
    kind: 'channel',
    target: '#help',
  };
  const notification = createContactSystemNotification({
    buffer: channelBuffer,
    networkName: 'ExampleNet',
    notificationConstructor: FakeNotification,
    onSelectBuffer: () => undefined,
  }) as FakeNotification;

  assert.equal(notification.title, '#help');
  assert.deepEqual(notification.options, {
    body: 'New message in #help on ExampleNet',
    tag: 'pulsete-channel:channel-help',
  });
});

test('system notification owner can close without retaining click handlers', () => {
  let selected = false;
  const notification = createContactSystemNotification({
    buffer,
    networkName: 'ExampleNet',
    notificationConstructor: FakeNotification,
    onSelectBuffer: () => {
      selected = true;
    },
  }) as FakeNotification;

  closeContactSystemNotification(notification);

  assert.equal(notification.closeCalls, 1);
  assert.equal(notification.onclick, null);
  assert.equal(notification.onclose, null);
  assert.equal(selected, false);
});

test('system notification dispatch tracks active notifications until release', () => {
  const activeNotifications = new Set<ContactSystemNotificationHandle>();

  showContactSystemNotification({
    activeNotifications,
    buffer,
    networkNamesById: new Map([['network-1', 'ExampleNet']]),
    notificationConstructor: FakeNotification,
    onSelectBuffer: () => undefined,
  });

  const notification = [...activeNotifications][0] as FakeNotification;

  assert.equal(activeNotifications.size, 1);
  assert.equal(notification.options?.body, 'New private message on ExampleNet');

  notification.onclose?.(new Event('close'));

  assert.equal(activeNotifications.size, 0);
});
