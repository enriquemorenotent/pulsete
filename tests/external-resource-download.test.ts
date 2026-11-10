import assert from 'node:assert/strict';
import test from 'node:test';
import { downloadExternalResource } from '../server/external-resource-download.js';
import type { PagePreviewNetwork, PagePreviewNetworkResponse } from '../server/page-preview-network.js';

const reply = (status: number, location: string | null = null): PagePreviewNetworkResponse => ({
  status, location, contentType: 'image/png', body: Buffer.from('picture'),
});
function setup(replies: Record<string, PagePreviewNetworkResponse>, maxRedirects = 3) {
  const calls: string[] = [];
  const network: PagePreviewNetwork = {
    resolve: async () => [{ address: '1.1.1.1', family: 4 }],
    request: async url => { calls.push(url.href); return replies[url.href] ?? reply(200); },
  };
  return { calls, load: () => downloadExternalResource(new URL('https://example.com/start'), {
    network, maxBytes: 100, timeoutMs: 100, maxRedirects, maxUrlLength: 2048,
  }) };
}

test('shared redirects resolve relative locations and discard fragments', async () => {
  const { calls, load } = setup({ 'https://example.com/start': reply(302, '/image#fragment') });
  const result = await load();
  assert.equal(result.url.href, 'https://example.com/image');
  assert.equal(result.response.body.toString(), 'picture');
  assert.deepEqual(calls, ['https://example.com/start', 'https://example.com/image']);
});

test('shared redirects reject loops, invalid locations, private targets and excessive hops before fetching them', async () => {
  for (const location of ['/start#other', 'http://127.0.0.1/private', 'https://user:password@example.com/', 'http://[', 'file:///etc/passwd', `/${'x'.repeat(2048)}`, null]) {
    const { calls, load } = setup({ 'https://example.com/start': reply(302, location) });
    await assert.rejects(load);
    assert.deepEqual(calls, ['https://example.com/start']);
  }
  const { calls, load } = setup({ 'https://example.com/start': reply(302, '/next'), 'https://example.com/next': reply(302, '/too-far') }, 1);
  await assert.rejects(load, /Too many/);
  assert.deepEqual(calls, ['https://example.com/start', 'https://example.com/next']);
});
