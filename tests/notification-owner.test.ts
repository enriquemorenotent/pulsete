import assert from 'node:assert/strict';
import test from 'node:test';
import { NotificationOwner } from '../web/src/contact-notifications/notification-owner.js';

type FakeNotification = { id: string };

class FakeScheduler {
  #nextTimer = 1;
  readonly callbacks = new Map<number, () => void>();

  clearTimeout = (timer: unknown) => {
    this.callbacks.delete(timer as number);
  };

  setTimeout = (callback: () => void) => {
    const timer = this.#nextTimer;
    this.#nextTimer += 1;
    this.callbacks.set(timer, callback);
    return timer;
  };

  runNext() {
    const next = this.callbacks.entries().next().value as
      | [number, () => void]
      | undefined;
    if (!next) {
      return;
    }
    this.callbacks.delete(next[0]);
    next[1]();
  }
}

const createOwner = (capacity = 2) => {
  const closed: FakeNotification[] = [];
  const scheduler = new FakeScheduler();
  const owner = new NotificationOwner<string, FakeNotification>({
    capacity,
    close: (notification) => closed.push(notification),
    lifetimeMs: 1_000,
    scheduler,
  });
  return { closed, owner, scheduler };
};

test('notification owner bounds handles by closing the oldest', () => {
  const { closed, owner, scheduler } = createOwner();
  const first = { id: 'first' };
  const second = { id: 'second' };
  const third = { id: 'third' };

  owner.track('first', first);
  owner.track('second', second);
  owner.track('third', third);

  assert.deepEqual(closed, [first]);
  assert.equal(owner.size, 2);
  assert.equal(owner.get('first'), undefined);
  assert.equal(scheduler.callbacks.size, 2);
});

test('notification owner replaces the handle for one key', () => {
  const { closed, owner, scheduler } = createOwner();
  const previous = { id: 'previous' };
  const current = { id: 'current' };

  owner.track('buffer', previous);
  owner.track('buffer', current);

  assert.deepEqual(closed, [previous]);
  assert.equal(owner.get('buffer'), current);
  assert.equal(scheduler.callbacks.size, 1);
});

test('notification owner expires and closes retained handles', () => {
  const { closed, owner, scheduler } = createOwner();
  const notification = { id: 'notification' };
  owner.track('buffer', notification);

  scheduler.runNext();

  assert.deepEqual(closed, [notification]);
  assert.equal(owner.size, 0);
  assert.equal(scheduler.callbacks.size, 0);
});

test('notification owner releases browser-closed handles without closing again', () => {
  const { closed, owner, scheduler } = createOwner();
  const notification = { id: 'notification' };
  owner.track('buffer', notification);

  assert.equal(owner.release('buffer', notification), true);

  assert.deepEqual(closed, []);
  assert.equal(owner.size, 0);
  assert.equal(scheduler.callbacks.size, 0);
});

test('notification owner ignores stale releases after replacement', () => {
  const { owner } = createOwner();
  const previous = { id: 'previous' };
  const current = { id: 'current' };
  owner.track('buffer', previous);
  owner.track('buffer', current);

  assert.equal(owner.release('buffer', previous), false);
  assert.equal(owner.get('buffer'), current);
});

test('notification owner closes all handles and cancels expiry timers', () => {
  const { closed, owner, scheduler } = createOwner();
  const first = { id: 'first' };
  const second = { id: 'second' };
  owner.track('first', first);
  owner.track('second', second);

  owner.closeAll();

  assert.deepEqual(closed, [first, second]);
  assert.equal(owner.size, 0);
  assert.equal(scheduler.callbacks.size, 0);
});
