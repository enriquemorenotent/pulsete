import assert from 'node:assert/strict';
import test from 'node:test';
import type { BufferState } from '../shared/protocol-chat.js';
import {
  closeContactSystemNotification,
  createContactSystemNotification,
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
