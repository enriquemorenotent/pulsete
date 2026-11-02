import assert from 'node:assert/strict';

export function assertProxiedMedia(markup: string, tag: string, source: string) {
  const match = new RegExp(`<${tag}[^>]*src="([^"]+)"`).exec(markup);
  assert.ok(match);
  const url = new URL(match[1]!.replaceAll('&amp;', '&'), 'http://localhost');
  assert.equal(url.pathname, '/api/media/resource');
  assert.equal(url.searchParams.get('url'), source);
}
