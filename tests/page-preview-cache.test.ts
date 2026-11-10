import assert from 'node:assert/strict';
import test from 'node:test';
import { createPagePreviewResolver } from '../server/page-preview-resolver.js';
import type { PagePreviewNetworkResponse } from '../server/page-preview-network.js';
import { resolvePagePreviewResult } from '../web/src/page-preview-media.js';

const imageResponse = (): PagePreviewNetworkResponse => ({ status: 200, contentType: 'image/png', location: null, body: Buffer.alloc(0) });

test('server preview eviction cannot duplicate a running request', async () => {
  let finish!: (value: PagePreviewNetworkResponse) => void;
  let slowCalls = 0;
  const resolver = createPagePreviewResolver({ cacheLimit: 1, concurrency: 2, network: {
    resolve: async () => [{ address: '1.1.1.1', family: 4 }],
    request: async url => {
      if (url.pathname === '/slow') { slowCalls++; return new Promise(resolve => { finish = resolve; }); }
      return imageResponse();
    },
  } });
  const slow = resolver.resolve('https://cache.example/slow');
  await resolver.resolve('https://cache.example/a');
  await resolver.resolve('https://cache.example/b');
  const again = resolver.resolve('https://cache.example/slow');
  finish(imageResponse());
  assert.deepEqual(await slow, await again);
  assert.equal(slowCalls, 1);
});

test('browser preview eviction cannot duplicate a running request', async t => {
  let finish!: (value: Response) => void;
  let slowCalls = 0;
  t.mock.method(globalThis, 'fetch', async (_url: unknown, init: RequestInit) => {
    const href = JSON.parse(String(init.body)).url as string;
    if (href.endsWith('/slow')) { slowCalls++; return new Promise<Response>(resolve => { finish = resolve; }); }
    return Response.json({ preview: null, unavailableReason: null });
  });
  const slow = resolvePagePreviewResult('https://pressure.example/slow');
  for (let index = 0; index < 257; index++) await resolvePagePreviewResult(`https://pressure.example/${index}`);
  const again = resolvePagePreviewResult('https://pressure.example/slow');
  assert.equal(again, slow);
  finish(Response.json({ preview: null, unavailableReason: 'not-found' }));
  assert.deepEqual(await slow, await again);
  assert.equal(slowCalls, 1);
});
