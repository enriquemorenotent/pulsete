import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parseFormattedMessageContent } from '../web/src/FormattedMessageText.js';
import { PagePreviewUnavailableStatusIcon } from '../web/src/PagePreviewUnavailableIndicator.js';
import {
  pagePreviewToInlineMedia,
  resolvePagePreviewMedia,
  resolvePagePreviewResult,
} from '../web/src/page-preview-media.js';

test('collects generic webpage links for metadata previews', () => {
  const parsed = parseFormattedMessageContent(
    'Page https://postimg.cc/NKXz1gmt '
      + 'image https://cdn.example/cat.png '
      + 'again https://postimg.cc/NKXz1gmt '
      + 'two https://example.com/two '
      + 'three https://example.com/three '
      + 'ignored https://example.com/four',
    'colors',
  );

  assert.deepEqual(parsed.pagePreviewHrefs, [
    'https://postimg.cc/NKXz1gmt',
    'https://example.com/two',
    'https://example.com/three',
  ]);
});

test('turns page metadata into an image preview that opens the original page', () => {
  assert.deepEqual(pagePreviewToInlineMedia(
    'https://postimg.cc/NKXz1gmt',
    {
      imageUrl: 'https://i.postimg.cc/rwZ22spD/image.gif',
      pageUrl: 'https://postimg.cc/NKXz1gmt',
      title: 'image hosted at Postimages',
    },
  ), {
    kind: 'image',
    label: 'image hosted at Postimages',
    originalHref: 'https://postimg.cc/NKXz1gmt',
    sourceHref: 'https://i.postimg.cc/rwZ22spD/image.gif',
  });
});

test('shares cached page preview requests across message renderers', async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = (async () => {
    fetchCalls += 1;
    return new Response(JSON.stringify({
      preview: {
        imageUrl: 'https://cdn.example/cache.png',
        pageUrl: 'https://preview-cache.example/post',
        title: 'Cached preview',
      },
      unavailableReason: null,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    const href = 'https://preview-cache.example/post';
    const [first, second] = await Promise.all([
      resolvePagePreviewMedia(href),
      resolvePagePreviewMedia(href),
    ]);
    const third = await resolvePagePreviewMedia(href);

    assert.equal(fetchCalls, 1);
    assert.deepEqual(second, first);
    assert.deepEqual(third, first);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('preserves confirmed not-found results for message status icons', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({
    preview: null,
    unavailableReason: 'not-found',
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })) as typeof fetch;

  try {
    assert.deepEqual(
      await resolvePagePreviewResult('https://not-found.example/post'),
      { media: null, unavailableReason: 'not-found' },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('renders an icon and tooltip only for confirmed not-found responses', () => {
  const notFoundHtml = renderToStaticMarkup(createElement(
    PagePreviewUnavailableStatusIcon,
    { reason: 'not-found' },
  ));
  const silentHtml = renderToStaticMarkup(createElement(
    PagePreviewUnavailableStatusIcon,
    { reason: null },
  ));

  assert.match(notFoundHtml, /role="img"/);
  assert.match(notFoundHtml, /aria-label="Page not found"/);
  assert.match(notFoundHtml, /title="Page not found"/);
  assert.match(notFoundHtml, /<svg/);
  assert.doesNotMatch(notFoundHtml, />Page not found</);
  assert.equal(silentHtml, '');
});
