import assert from 'node:assert/strict';
import test from 'node:test';
import type { PagePreviewResolver } from '../server/page-preview-resolver.js';
import { requestJson } from './helpers/http-request-helpers.js';
import { createHttpRuntimeContext } from './helpers/http-runtime-test-helpers.js';

test('page preview route resolves a generic webpage URL', async () => {
  const resolvedUrls: string[] = [];
  const resolver: PagePreviewResolver = {
    async resolve(url) {
      resolvedUrls.push(url);
      return {
        preview: {
          imageUrl: 'https://cdn.example/card.png',
          pageUrl: url,
          title: 'Example card',
        },
        unavailableReason: null,
      };
    },
  };
  const context = await createHttpRuntimeContext({
    handler: { pagePreviewResolver: resolver },
  });

  try {
    const response = await requestJson(
      context.port,
      'POST',
      '/api/media/page-preview',
      { url: 'https://example.com/post' },
    );

    assert.equal(response.status, 200);
    assert.deepEqual(response.json, {
      preview: {
        imageUrl: 'https://cdn.example/card.png',
        pageUrl: 'https://example.com/post',
        title: 'Example card',
      },
      unavailableReason: null,
    });
    assert.deepEqual(resolvedUrls, ['https://example.com/post']);
  } finally {
    await context.close();
  }
});

test('page preview route preserves confirmed not-found results', async () => {
  const context = await createHttpRuntimeContext({
    handler: {
      pagePreviewResolver: {
        async resolve() {
          return { preview: null, unavailableReason: 'not-found' };
        },
      },
    },
  });

  try {
    const response = await requestJson(
      context.port,
      'POST',
      '/api/media/page-preview',
      { url: 'https://example.com/missing' },
    );

    assert.equal(response.status, 200);
    assert.deepEqual(response.json, {
      preview: null,
      unavailableReason: 'not-found',
    });
  } finally {
    await context.close();
  }
});

test('page preview route rejects malformed payloads', async () => {
  const context = await createHttpRuntimeContext({
    handler: {
      pagePreviewResolver: {
        async resolve() {
          assert.fail('resolver should not be called');
        },
      },
    },
  });

  try {
    const response = await requestJson(
      context.port,
      'POST',
      '/api/media/page-preview',
      { href: 'https://example.com/post' },
    );

    assert.equal(response.status, 400);
    assert.equal(response.json.message, 'Invalid page preview payload');
  } finally {
    await context.close();
  }
});
