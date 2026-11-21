import assert from 'node:assert/strict';
import test from 'node:test';
import { setImmediate } from 'node:timers/promises';
import { loadAccountMedia } from '../server/account-media-cache.js';

const account = 'media-cache-test';

for (const { name, mimeType, lifetime } of [
  { name: 'video', mimeType: 'video/mp4', lifetime: 60_000 },
  { name: 'image with no-store', mimeType: 'image/gif', lifetime: 0 },
]) {
  test(`a second ${name} request can finish while the first is still downloading`, async () => {
    const href = `https://example.test/${encodeURIComponent(name)}`;
    const resource = { mimeType, body: Buffer.from(name), freshUntil: Date.now() + lifetime };
    let release!: () => void;
    const blocked = new Promise<void>(resolve => { release = resolve; });
    const first = loadAccountMedia(account, href, undefined, async () => {
      await blocked;
      return resource;
    });
    const second = loadAccountMedia(account, href, undefined, async () => resource);

    try {
      assert.equal(await Promise.race([second, setImmediate()]), resource);
    } finally {
      release();
      await Promise.allSettled([first, second]);
    }
  });
}

test('a failed image download leaves a concurrent successful download available for reuse', async () => {
  const href = 'https://example.test/overlapping.gif';
  const failure = new Error('Temporary connection failure');
  const resource = { mimeType: 'image/gif', body: Buffer.from('gif'), freshUntil: Date.now() + 60_000 };
  let fail!: (error: Error) => void;
  const stalled = new Promise<never>((_resolve, reject) => { fail = reject; });
  const first = loadAccountMedia(account, href, undefined, () => stalled);
  const second = loadAccountMedia(account, href, undefined, async () => resource);
  const results = Promise.allSettled([first, second]);

  fail(failure);
  assert.deepEqual(await results, [
    { status: 'rejected', reason: failure },
    { status: 'fulfilled', value: resource },
  ]);
  const cached = await loadAccountMedia(account, href, undefined, async () => assert.fail('Expected a cache hit'));
  assert.equal(cached, resource);
});
