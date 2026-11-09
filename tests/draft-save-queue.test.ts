import assert from 'node:assert/strict';
import test from 'node:test';
import { DraftSaveQueue } from '../web/src/draft-save-queue.js';

function setup() {
  const timers = new Map<number, { callback: () => void; delay: number }>();
  let timerId = 0;
  const calls: { bufferId: string; body: string; resolve: (saved: boolean) => void; reject: (error: Error) => void }[] = [];
  const queue = new DraftSaveQueue((bufferId, body) => new Promise<boolean>((resolve, reject) => {
    calls.push({ bufferId, body, resolve, reject });
  }), {
    setTimeout(callback, delay) { const id = ++timerId; timers.set(id, { callback, delay }); return id; },
    clearTimeout(timer) { timers.delete(timer as number); },
  });
  const tick = () => {
    for (const [id, timer] of [...timers]) {
      timers.delete(id);
      timer.callback();
    }
  };
  const bodies = () => calls.map(call => call.body);
  return { queue, calls, timers, tick, bodies };
}

test('draft saves debounce and coalesce edits while keeping only one request in flight', async () => {
  const { queue, calls, tick, bodies } = setup();
  queue.enqueue('a', 'first');
  queue.enqueue('a', 'second');
  tick();
  assert.deepEqual(bodies(), ['second']);
  queue.enqueue('a', 'third');
  tick();
  queue.enqueue('a', 'latest');
  tick();
  assert.deepEqual(bodies(), ['second']);
  calls[0]!.resolve(true);
  await Promise.resolve();
  assert.deepEqual(bodies(), ['second', 'latest']);
  calls[1]!.resolve(true);
});

test('a failed old save never retries over a newer edit', async () => {
  const { queue, calls, tick, timers, bodies } = setup();
  queue.enqueue('a', 'old');
  tick();
  queue.enqueue('a', 'new');
  tick();
  calls[0]!.resolve(false);
  await Promise.resolve();
  assert.deepEqual(bodies(), ['old', 'new']);
  calls[1]!.resolve(true);
  await Promise.resolve();
  tick();
  assert.equal(timers.size, 0);
  assert.deepEqual(bodies(), ['old', 'new']);
});

test('failed and rejected saves retry, but edits replace the retry payload', async () => {
  for (const reject of [false, true]) {
    const { queue, calls, tick, timers, bodies } = setup();
    queue.enqueue('a', 'old');
    tick();
    if (reject) calls[0]!.reject(new Error('offline'));
    else calls[0]!.resolve(false);
    await Promise.resolve();
    assert.deepEqual([...timers.values()].map(timer => timer.delay), [2000]);
    tick();
    assert.deepEqual(bodies(), ['old', 'old']);
    calls[1]!.resolve(false);
    await Promise.resolve();
    queue.enqueue('a', 'new');
    assert.equal(timers.size, 1);
    tick();
    assert.deepEqual(bodies(), ['old', 'old', 'new']);
    calls[2]!.resolve(true);
  }
});

test('clearing a draft waits for its previous save and cannot be overwritten by its retry', async () => {
  const { queue, calls, tick, bodies, timers } = setup();
  queue.enqueue('a', 'text');
  tick();
  queue.enqueue('a', '');
  assert.deepEqual(bodies(), ['text']);
  calls[0]!.resolve(false);
  await Promise.resolve();
  assert.deepEqual(bodies(), ['text', '']);
  calls[1]!.resolve(true);
  await Promise.resolve();
  assert.equal(timers.size, 0);
});

test('different conversations save independently and flushing cancels debounce timers', async () => {
  const { queue, calls, tick, timers } = setup();
  queue.enqueue('a', 'one');
  queue.enqueue('b', 'two');
  queue.flush();
  queue.flush();
  tick();
  assert.deepEqual(calls.map(call => call.bufferId), ['a', 'b']);
  assert.equal(timers.size, 0);
  for (const call of calls) call.resolve(true);
  await Promise.resolve();
});

test('teardown drains newer edits in order and stops retries', async () => {
  const { queue, calls, tick, timers, bodies } = setup();
  queue.enqueue('a', 'old');
  tick();
  queue.enqueue('a', 'latest');
  queue.stop();
  assert.equal(timers.size, 0);
  assert.deepEqual(bodies(), ['old']);
  calls[0]!.resolve(false);
  await Promise.resolve();
  assert.deepEqual(bodies(), ['old', 'latest']);
  calls[1]!.resolve(false);
  await Promise.resolve();
  assert.equal(timers.size, 0);
});

test('resuming after effect cleanup preserves in-flight ordering and uses the current save callback', async () => {
  const { queue, calls, tick, bodies } = setup();
  queue.enqueue('a', 'old');
  tick();
  queue.stop();
  queue.resume();
  const next: string[] = [];
  queue.setSaveDraft(async (_id, body) => { next.push(body); return true; });
  queue.enqueue('a', 'new');
  tick();
  assert.deepEqual(next, []);
  calls[0]!.resolve(false);
  await Promise.resolve();
  assert.deepEqual(next, ['new']);
  assert.deepEqual(bodies(), ['old']);
});
