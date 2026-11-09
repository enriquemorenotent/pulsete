import assert from 'node:assert/strict';
import test from 'node:test';
import { LatestRequest } from '../web/src/latest-request.js';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function start(requests: LatestRequest) {
  const response = deferred<string>();
  const events: unknown[] = [];
  let signal!: AbortSignal;
  const done = requests.run({
    load: received => { signal = received; return response.promise; },
    onLoaded: value => events.push(value),
    onError: error => events.push(error),
    onSettled: () => events.push('settled'),
  });
  return { ...response, events, done, signal };
}

test('replaced requests cannot publish results or clear the new request loading state', async () => {
  const requests = new LatestRequest();
  const first = start(requests);
  const latest = start(requests);
  assert.equal(first.signal.aborted, true);
  first.resolve('outdated');
  await first.done;
  assert.deepEqual(first.events, []);
  assert.equal(requests.pending, true);
  latest.resolve('latest');
  await latest.done;
  assert.deepEqual(latest.events, ['latest', 'settled']);
  assert.equal(requests.pending, false);
});

test('late errors from replaced requests are ignored even after the newest finishes', async () => {
  const requests = new LatestRequest();
  const first = start(requests);
  const latest = start(requests);
  latest.resolve('latest');
  await latest.done;
  first.reject(new Error('old failure'));
  await first.done;
  assert.deepEqual(first.events, []);
  assert.deepEqual(latest.events, ['latest', 'settled']);
  assert.equal(requests.pending, false);
});

test('cancelling on close ignores both success and failure and permits reopening', async () => {
  for (const fails of [false, true]) {
    const requests = new LatestRequest();
    const closed = start(requests);
    requests.cancel();
    assert.equal(closed.signal.aborted, true);
    assert.equal(requests.pending, false);
    const reopened = start(requests);
    if (fails) closed.reject(new Error('late failure'));
    else closed.resolve('late result');
    await closed.done;
    assert.deepEqual(closed.events, []);
    assert.equal(requests.pending, true);
    reopened.resolve('reopened');
    await reopened.done;
    assert.deepEqual(reopened.events, ['reopened', 'settled']);
  }
});

test('independent request lanes do not cancel each other', async () => {
  const a = new LatestRequest();
  const b = new LatestRequest();
  const first = start(a);
  const second = start(b);
  a.cancel();
  assert.equal(second.signal.aborted, false);
  second.resolve('independent');
  first.resolve('ignored');
  await Promise.all([first.done, second.done]);
  assert.deepEqual(second.events, ['independent', 'settled']);
});

test('current failures settle once, including synchronous load failures', async () => {
  const requests = new LatestRequest();
  const events: unknown[] = [];
  const failure = new Error('failed');
  await requests.run({
    load: () => { throw failure; },
    onLoaded: () => assert.fail('unexpected result'),
    onError: error => events.push(error),
    onSettled: () => events.push('settled'),
  });
  assert.deepEqual(events, [failure, 'settled']);
  assert.equal(requests.pending, false);
});

test('a result callback starting another request cannot settle that newer request', async () => {
  const requests = new LatestRequest();
  let next!: ReturnType<typeof start>;
  await requests.run({
    load: async () => 'first',
    onLoaded: () => { next = start(requests); },
    onError: () => assert.fail('unexpected error'),
    onSettled: () => assert.fail('old request must not settle'),
  });
  assert.equal(requests.pending, true);
  next.resolve('next');
  await next.done;
  assert.deepEqual(next.events, ['next', 'settled']);
});
