import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isAllowedPagePreviewUrl,
  isPublicIpAddress,
  type PagePreviewAddress,
  type PagePreviewNetwork,
  type PagePreviewNetworkResponse,
} from '../server/page-preview-network.js';
import {
  createPagePreviewResolver,
  extractPagePreviewMetadata,
} from '../server/page-preview-resolver.js';

const publicAddress: PagePreviewAddress = {
  address: '93.184.216.34',
  family: 4,
};

test('extracts generic Open Graph metadata without depending on a host', () => {
  const metadata = extractPagePreviewMetadata(`
    <html>
      <head>
        <meta content="/media/cat.gif?size=large&amp;frame=1" property="og:image">
        <meta content="Cats &amp; Friends" property="og:title">
      </head>
    </html>
  `, new URL('https://photos.example/gallery/42'));

  assert.deepEqual(metadata, {
    imageUrl: 'https://photos.example/media/cat.gif?size=large&frame=1',
    title: 'Cats & Friends',
  });
});

test('falls back to Twitter metadata and the HTML title', () => {
  const twitter = extractPagePreviewMetadata(
    '<meta name="twitter:image" content="https://cdn.example/card.png">',
    new URL('https://example.com/post'),
  );
  const htmlTitle = extractPagePreviewMetadata(
    '<title>  A title\n with spaces  </title><meta property="og:image" content="/card.jpg">',
    new URL('https://example.com/post'),
  );

  assert.equal(twitter.imageUrl, 'https://cdn.example/card.png');
  assert.equal(htmlTitle.title, 'A title with spaces');
});

test('accepts public addresses and rejects local or reserved addresses', () => {
  assert.equal(isPublicIpAddress('8.8.8.8'), true);
  assert.equal(isPublicIpAddress('2606:4700:4700::1111'), true);

  for (const address of [
    '0.0.0.0',
    '10.0.0.1',
    '100.64.0.1',
    '127.0.0.1',
    '169.254.1.1',
    '172.16.0.1',
    '192.168.0.1',
    '198.51.100.1',
    '224.0.0.1',
    '::1',
    'fc00::1',
    'fe80::1',
    '2001:db8::1',
    '2001:2::1',
  ]) {
    assert.equal(isPublicIpAddress(address), false, address);
  }
});

test('only allows credential-free HTTP URLs on their default ports', () => {
  assert.equal(isAllowedPagePreviewUrl(new URL('https://example.com/post')), true);
  assert.equal(isAllowedPagePreviewUrl(new URL('http://example.com/post')), true);
  assert.equal(isAllowedPagePreviewUrl(new URL('https://example.com:444/post')), false);
  assert.equal(isAllowedPagePreviewUrl(new URL('https://user@example.com/post')), false);
  assert.equal(isAllowedPagePreviewUrl(new URL('ftp://example.com/file')), false);
});

test('rejects oversized URLs before making a network request', async () => {
  const fixture = createNetworkFixture({});
  const value = `https://example.com/${'a'.repeat(2_100)}`;

  assert.deepEqual(
    await createPagePreviewResolver({ network: fixture.network }).resolve(value),
    unavailablePagePreview(),
  );
  assert.deepEqual(fixture.requestedUrls, []);
});

test('follows public redirects, resolves relative media, and caches the result', async () => {
  const fixture = createNetworkFixture({
    'https://start.example/post': response(302, '', '', 'https://final.example/gallery/42'),
    'https://final.example/gallery/42': response(
      200,
      'text/html; charset=utf-8',
      '<meta property="og:image" content="/media/card.png?x=1&amp;y=2">'
        + '<meta property="og:title" content="A gallery">',
    ),
  });
  const resolver = createPagePreviewResolver({ network: fixture.network });

  const first = await resolver.resolve('https://start.example/post#comments');
  const second = await resolver.resolve('https://start.example/post');

  assert.deepEqual(first, {
    preview: {
      imageUrl: 'https://final.example/media/card.png?x=1&y=2',
      pageUrl: 'https://final.example/gallery/42',
      title: 'A gallery',
    },
    unavailableReason: null,
  });
  assert.deepEqual(second, first);
  assert.deepEqual(fixture.requestedUrls, [
    'https://start.example/post',
    'https://final.example/gallery/42',
  ]);
  assert.deepEqual(fixture.requestedAddresses, [
    publicAddress.address,
    publicAddress.address,
  ]);
});

test('rejects private page, redirect, and metadata image destinations', async () => {
  const privatePage = createNetworkFixture({}, {
    'private.example': [{ address: '127.0.0.1', family: 4 }],
  });
  const privatePageResolver = createPagePreviewResolver({
    network: privatePage.network,
  });
  assert.deepEqual(
    await privatePageResolver.resolve('http://private.example/admin'),
    unavailablePagePreview(),
  );
  assert.deepEqual(privatePage.requestedUrls, []);

  const privateRedirect = createNetworkFixture({
    'https://public.example/post': response(
      302,
      '',
      '',
      'http://private.example/admin',
    ),
  }, {
    'private.example': [{ address: '10.0.0.5', family: 4 }],
  });
  assert.deepEqual(
    await createPagePreviewResolver({ network: privateRedirect.network })
      .resolve('https://public.example/post'),
    unavailablePagePreview(),
  );
  assert.deepEqual(privateRedirect.requestedUrls, ['https://public.example/post']);

  const privateImage = createNetworkFixture({
    'https://public.example/post': response(
      200,
      'text/html',
      '<meta property="og:image" content="http://private.example/secret.png">',
    ),
  }, {
    'private.example': [{ address: '192.168.1.20', family: 4 }],
  });
  assert.deepEqual(
    await createPagePreviewResolver({ network: privateImage.network })
      .resolve('https://public.example/post'),
    unavailablePagePreview(),
  );
});

test('rejects mixed public and private DNS results', async () => {
  const fixture = createNetworkFixture({}, {
    'mixed.example': [
      publicAddress,
      { address: '127.0.0.1', family: 4 },
    ],
  });

  assert.deepEqual(
    await createPagePreviewResolver({ network: fixture.network })
      .resolve('https://mixed.example/post'),
    unavailablePagePreview(),
  );
  assert.deepEqual(fixture.requestedUrls, []);
});

test('handles direct images and stops redirect loops', async () => {
  const imageFixture = createNetworkFixture({
    'https://cdn.example/image': response(200, 'image/png'),
  });
  assert.deepEqual(
    await createPagePreviewResolver({ network: imageFixture.network })
      .resolve('https://cdn.example/image'),
    {
      preview: {
        imageUrl: 'https://cdn.example/image',
        pageUrl: 'https://cdn.example/image',
        title: null,
      },
      unavailableReason: null,
    },
  );

  const loopFixture = createNetworkFixture({
    'https://a.example/post': response(302, '', '', 'https://b.example/post'),
    'https://b.example/post': response(302, '', '', 'https://a.example/post'),
  });
  assert.deepEqual(
    await createPagePreviewResolver({ network: loopFixture.network })
      .resolve('https://a.example/post'),
    unavailablePagePreview(),
  );
  assert.deepEqual(loopFixture.requestedUrls, [
    'https://a.example/post',
    'https://b.example/post',
  ]);
});

test('times out stalled DNS lookups', async () => {
  const network: PagePreviewNetwork = {
    async request() {
      assert.fail('request should not be called');
    },
    async resolve() {
      return new Promise<readonly PagePreviewAddress[]>(() => {});
    },
  };

  assert.deepEqual(
    await createPagePreviewResolver({ network, timeoutMs: 10 })
      .resolve('https://stalled.example/post'),
    unavailablePagePreview(),
  );
});

test('reports only confirmed not-found HTTP responses', async () => {
  for (const status of [404, 410]) {
    const fixture = createNetworkFixture({
      [`https://status-${status}.example/post`]: response(status, 'text/html'),
    });
    assert.deepEqual(
      await createPagePreviewResolver({ network: fixture.network })
        .resolve(`https://status-${status}.example/post`),
      unavailablePagePreview('not-found'),
    );
  }

  const serverError = createNetworkFixture({
    'https://status-500.example/post': response(500, 'text/html'),
  });
  assert.deepEqual(
    await createPagePreviewResolver({ network: serverError.network })
      .resolve('https://status-500.example/post'),
    unavailablePagePreview(),
  );
});

const unavailablePagePreview = (
  unavailableReason: 'not-found' | null = null,
) => ({
  preview: null,
  unavailableReason,
});

const response = (
  status: number,
  contentType = '',
  body = '',
  location: string | null = null,
): PagePreviewNetworkResponse => ({
  body: Buffer.from(body),
  contentType,
  location,
  status,
});

const createNetworkFixture = (
  responses: Record<string, PagePreviewNetworkResponse>,
  addresses: Record<string, readonly PagePreviewAddress[]> = {},
) => {
  const requestedAddresses: string[] = [];
  const requestedUrls: string[] = [];
  const network: PagePreviewNetwork = {
    async request(url, address) {
      requestedUrls.push(url.href);
      requestedAddresses.push(address.address);
      const value = responses[url.href];
      if (!value) {
        throw new Error(`Unexpected request: ${url.href}`);
      }
      return value;
    },
    async resolve(hostname) {
      return addresses[hostname] ?? [publicAddress];
    },
  };
  return { network, requestedAddresses, requestedUrls };
};
