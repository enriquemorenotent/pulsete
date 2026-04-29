import assert from 'node:assert/strict';
import test from 'node:test';
import type { RefObject } from 'react';
import { scheduleAnimationFrameFocus } from '../web/src/animation-frame-focus.js';

test('scheduled animation-frame focus can be cancelled before it retains a stale dialog ref', () => {
  const callbacks: FrameRequestCallback[] = [];
  const cancelled: number[] = [];
  const ref = {
    current: {
      focusCalls: 0,
      focus() {
        this.focusCalls += 1;
      },
    },
  } satisfies RefObject<{ focusCalls: number; focus: () => void } | null>;

  const cancel = scheduleAnimationFrameFocus({
    requestAnimationFrame: (nextCallback) => {
      callbacks.push(nextCallback);
      return 42;
    },
    cancelAnimationFrame: (handle) => {
      cancelled.push(handle);
      callbacks.length = 0;
    },
  }, ref);

  cancel();

  assert.deepEqual(cancelled, [42]);
  assert.deepEqual(callbacks, []);
  assert.equal(ref.current?.focusCalls, 0);
});

test('scheduled animation-frame focus runs when it is still current', () => {
  const callbacks: FrameRequestCallback[] = [];
  const ref = {
    current: {
      focusCalls: 0,
      focus() {
        this.focusCalls += 1;
      },
    },
  } satisfies RefObject<{ focusCalls: number; focus: () => void } | null>;

  scheduleAnimationFrameFocus({
    requestAnimationFrame: (nextCallback) => {
      callbacks.push(nextCallback);
      return 7;
    },
    cancelAnimationFrame: () => undefined,
  }, ref);
  const scheduledCallback = callbacks[0];
  assert.ok(scheduledCallback);
  scheduledCallback(0);

  assert.equal(ref.current?.focusCalls, 1);
});
