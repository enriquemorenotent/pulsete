import assert from 'node:assert/strict';
import test from 'node:test';
import { AsyncResultCache } from '../shared/async-result-cache.js';

test('running work stays shared when completed results are evicted', async () => {
  const cache = new AsyncResultCache<string, string>({ limit: 1, ttlMs: () => 1000 });
  let finish!: (value: string) => void;
  let calls = 0;
  const load = () => { calls++; return new Promise<string>(resolve => { finish = resolve; }); };
  const first = cache.get('slow', load);
  await cache.get('a', async () => 'a');
  await cache.get('b', async () => 'b');
  const second = cache.get('slow', load);
  assert.equal(second, first);
  assert.equal(calls, 1);
  finish('done');
  assert.deepEqual(await Promise.all([first, second]), ['done', 'done']);
  assert.equal(await cache.get('slow', load), 'done');
  assert.equal(calls, 1);
});

test('expiry starts when work completes and can differ for negative results', async () => {
  let now = 0;
  const cache = new AsyncResultCache<string, boolean>({ limit: 2, ttlMs: value => value ? 100 : 10, now: () => now });
  let finish!: (value: boolean) => void;
  const pending = cache.get('positive', () => new Promise(resolve => { finish = resolve; }));
  await Promise.resolve();
  now = 1000;
  finish(true);
  await pending;
  await cache.get('negative', async () => false);
  now = 1010;
  let calls = 0;
  assert.equal(await cache.get('positive', async () => { calls++; return false; }), true);
  assert.equal(await cache.get('negative', async () => { calls++; return true; }), true);
  assert.equal(calls, 1);
  now = 1100;
  assert.equal(await cache.get('positive', async () => { calls++; return false; }), false);
  assert.equal(calls, 2);
});

test('failed loaders are shared while running but do not poison later attempts', async () => {
  for (const synchronous of [false, true]) {
    const cache = new AsyncResultCache<string, string>({ limit: 1, ttlMs: () => 1000 });
    const failure = new Error('failed');
    const load = () => { if (synchronous) throw failure; return Promise.reject(failure); };
    const first = cache.get('key', load);
    assert.equal(cache.get('key', load), first);
    await assert.rejects(first, error => error === failure);
    assert.equal(await cache.get('key', async () => 'recovered'), 'recovered');
  }
});

test('completed results obey capacity and zero TTL does not retain a result', async () => {
  const cache = new AsyncResultCache<string, string>({ limit: 1, ttlMs: value => value === 'temporary' ? 0 : 1000 });
  await cache.get('a', async () => 'a');
  await cache.get('b', async () => 'b');
  assert.equal(await cache.get('a', async () => 'reloaded'), 'reloaded');
  assert.equal(await cache.get('x', async () => 'temporary'), 'temporary');
  assert.equal(await cache.get('x', async () => 'fresh'), 'fresh');
});
