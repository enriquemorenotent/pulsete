import assert from 'node:assert/strict';
import test from 'node:test';
import { setImmediate } from 'node:timers/promises';
import { loadAccountMedia } from '../server/account-media-cache.js';

const account = 'media-cache-test';

for (const { name, mimeType, lifetime, cacheLoopingVideo } of [
  { name: 'video', mimeType: 'video/mp4', lifetime: 60_000, cacheLoopingVideo: false },
  { name: 'looping video', mimeType: 'video/mp4', lifetime: 60_000, cacheLoopingVideo: true },
  { name: 'image with no-store', mimeType: 'image/gif', lifetime: 0, cacheLoopingVideo: false },
]) {
  test(`a second ${name} request can finish while the first is still downloading`, async () => {
    const href = `https://example.test/${encodeURIComponent(name)}`;
    const resource = { mimeType, body: Buffer.from(name), freshUntil: Date.now() + lifetime };
    let release!: () => void;
    const blocked = new Promise<void>(resolve => { release = resolve; });
    const first = loadAccountMedia(account, href, undefined, async () => {
      await blocked;
      return resource;
    }, cacheLoopingVideo);
    const second = loadAccountMedia(account, href, undefined, async () => resource, cacheLoopingVideo);

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

test('looping clips have a 4 MiB item limit and a separate 16 MiB eviction budget', async () => {
  const mib = 1024 * 1024;
  const image = { mimeType: 'image/gif', body: Buffer.alloc(20 * mib), freshUntil: Date.now() + 60_000 };
  const clip = { mimeType: 'video/mp4', body: Buffer.alloc(4 * mib), freshUntil: image.freshUntil };
  const largeClip = { ...clip, body: Buffer.alloc(4 * mib + 1) };
  const downloadUnexpectedly = async () => assert.fail('Expected a cache hit');
  const videoUrl = (index: number) => `https://example.test/limits/${index}.mp4`;
  const imageUrl = 'https://example.test/limits/image.gif';

  await loadAccountMedia(account, imageUrl, undefined, async () => image);
  for (let index = 0; index < 4; index++) {
    await loadAccountMedia(account, videoUrl(index), undefined, async () => clip, true);
  }
  await loadAccountMedia(account, videoUrl(0), undefined, downloadUnexpectedly, true);
  await loadAccountMedia(account, videoUrl(4), undefined, async () => clip, true);
  await loadAccountMedia(account, videoUrl(0), undefined, downloadUnexpectedly, true);
  await loadAccountMedia(account, imageUrl, undefined, downloadUnexpectedly);

  let loads = 0;
  const loadLarge = async () => { loads++; return largeClip; };
  await loadAccountMedia(account, videoUrl(5), undefined, loadLarge, true);
  await loadAccountMedia(account, videoUrl(5), undefined, loadLarge, true);
  assert.equal(loads, 2);
  assert.equal(await loadAccountMedia(account, videoUrl(1), undefined, loadLarge, true), largeClip);
  assert.equal(loads, 3);
});

test('cached media is released at expiry even when no further requests arrive', async (t) => {
  const start = Date.now();
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: start });
  const media = [
    { href: 'https://example.test/idle.gif', mimeType: 'image/gif', looping: false },
    { href: 'https://example.test/idle.mp4', mimeType: 'video/mp4', looping: true },
  ];
  let downloads = 0;
  const download = (mimeType: string) => async () => ({
    mimeType, body: Buffer.from(String(++downloads)), freshUntil: start + 1000,
  });

  for (const { href, mimeType, looping } of media) {
    await loadAccountMedia(account, href, undefined, download(mimeType), looping);
  }
  t.mock.timers.tick(1000);
  // Rewind the clock so a lookup alone would still consider retained entries fresh.
  t.mock.timers.setTime(start);

  for (const { href, mimeType, looping } of media) {
    await loadAccountMedia(account, href, undefined, download(mimeType), looping);
  }
  assert.equal(downloads, 4);
  t.mock.timers.tick(1000);
});
