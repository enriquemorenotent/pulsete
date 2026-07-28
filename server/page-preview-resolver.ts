import {
  pagePreviewUrlMaxLength,
  type PagePreviewResponse,
  type PagePreviewUnavailableReason,
} from '../shared/protocol-page-preview.js';
import {
  defaultPagePreviewNetwork,
  isAllowedPagePreviewUrl,
  resolvePublicPagePreviewAddress,
  type PagePreviewNetwork,
  type PagePreviewNetworkResponse,
} from './page-preview-network.js';

export type PagePreviewResolver = {
  resolve(url: string): Promise<PagePreviewResponse>;
};

type PagePreviewResolverOptions = {
  cacheLimit?: number;
  concurrency?: number;
  maxBytes?: number;
  maxRedirects?: number;
  negativeTtlMs?: number;
  network?: PagePreviewNetwork;
  timeoutMs?: number;
  ttlMs?: number;
};

type CacheEntry = {
  expiresAt: number;
  promise: Promise<PagePreviewResponse>;
};

type PagePreviewMetadata = {
  imageUrl: string | null;
  title: string | null;
};

const defaultCacheLimit = 256;
const defaultConcurrency = 4;
const defaultMaxBytes = 512 * 1024;
const defaultMaxRedirects = 3;
const defaultNegativeTtlMs = 15 * 60 * 1_000;
const defaultTimeoutMs = 5_000;
const defaultTtlMs = 6 * 60 * 60 * 1_000;
const titleMaxLength = 200;

export const createPagePreviewResolver = (
  options: PagePreviewResolverOptions = {},
): PagePreviewResolver => {
  const cache = new Map<string, CacheEntry>();
  const cacheLimit = options.cacheLimit ?? defaultCacheLimit;
  const network = options.network ?? defaultPagePreviewNetwork;
  const schedule = createTaskScheduler(options.concurrency ?? defaultConcurrency);

  return {
    async resolve(input) {
      const url = normalizePreviewUrl(input);
      if (!url) {
        return unavailablePagePreview();
      }
      const cacheKey = url.href;
      const cached = cache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        return cached.promise;
      }
      if (cached) {
        cache.delete(cacheKey);
      }

      const entry: CacheEntry = {
        expiresAt: Number.POSITIVE_INFINITY,
        promise: Promise.resolve(unavailablePagePreview()),
      };
      entry.promise = schedule(() =>
        resolvePagePreview(url, {
          maxBytes: options.maxBytes ?? defaultMaxBytes,
          maxRedirects: options.maxRedirects ?? defaultMaxRedirects,
          network,
          timeoutMs: options.timeoutMs ?? defaultTimeoutMs,
        }))
        .catch(() => unavailablePagePreview())
        .then((result) => {
          entry.expiresAt = Date.now() + (
            result.preview
              ? options.ttlMs ?? defaultTtlMs
              : options.negativeTtlMs ?? defaultNegativeTtlMs
          );
          return result;
        });
      cache.set(cacheKey, entry);
      trimCache(cache, cacheLimit);
      return entry.promise;
    },
  };
};

const resolvePagePreview = async (
  initialUrl: URL,
  options: {
    maxBytes: number;
    maxRedirects: number;
    network: PagePreviewNetwork;
    timeoutMs: number;
  },
): Promise<PagePreviewResponse> => {
  let pageUrl = initialUrl;
  const visitedUrls = new Set([initialUrl.href]);
  for (let redirectCount = 0; redirectCount <= options.maxRedirects; redirectCount += 1) {
    const address = await resolveAddress(pageUrl, options);
    if (!address) {
      return unavailablePagePreview();
    }
    const response = await options.network.request(pageUrl, address, {
      maxBytes: options.maxBytes,
      timeoutMs: options.timeoutMs,
    });
    if (isRedirectResponse(response)) {
      if (redirectCount === options.maxRedirects || !response.location) {
        return unavailablePagePreview();
      }
      const redirectUrl = normalizePreviewUrl(response.location, pageUrl);
      if (!redirectUrl || visitedUrls.has(redirectUrl.href)) {
        return unavailablePagePreview();
      }
      visitedUrls.add(redirectUrl.href);
      pageUrl = redirectUrl;
      continue;
    }
    if (response.status === 404 || response.status === 410) {
      return unavailablePagePreview('not-found');
    }
    if (response.status < 200 || response.status >= 300) {
      return unavailablePagePreview();
    }
    if (response.contentType.startsWith('image/')) {
      return {
        preview: {
          imageUrl: pageUrl.href,
          pageUrl: pageUrl.href,
          title: null,
        },
        unavailableReason: null,
      };
    }
    if (!isHtmlContentType(response.contentType)) {
      return unavailablePagePreview();
    }

    const metadata = extractPagePreviewMetadata(
      response.body.toString('utf8'),
      pageUrl,
    );
    const imageUrl = metadata.imageUrl
      ? normalizePreviewUrl(metadata.imageUrl, pageUrl)
      : null;
    if (
      !imageUrl
      || !await resolveAddress(imageUrl, options)
    ) {
      return unavailablePagePreview();
    }
    return {
      preview: {
        imageUrl: imageUrl.href,
        pageUrl: pageUrl.href,
        title: metadata.title,
      },
      unavailableReason: null,
    };
  }
  return unavailablePagePreview();
};

const unavailablePagePreview = (
  unavailableReason: PagePreviewUnavailableReason | null = null,
): PagePreviewResponse => ({
  preview: null,
  unavailableReason,
});

const resolveAddress = (
  url: URL,
  options: {
    network: PagePreviewNetwork;
    timeoutMs: number;
  },
) => withTimeout(
  resolvePublicPagePreviewAddress(url, options.network),
  options.timeoutMs,
);

export const extractPagePreviewMetadata = (
  html: string,
  pageUrl: URL,
): PagePreviewMetadata => {
  const values = new Map<string, string>();
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const attributes = parseHtmlAttributes(tag);
    const key = (
      attributes.get('property')
      ?? attributes.get('name')
      ?? ''
    ).trim().toLowerCase();
    const content = attributes.get('content')?.trim();
    if (key && content && !values.has(key)) {
      values.set(key, decodeHtmlEntities(content));
    }
  }

  const imageUrl = [
    'og:image:secure_url',
    'og:image',
    'og:image:url',
    'twitter:image',
    'twitter:image:src',
  ].map((key) => values.get(key)).find(Boolean) ?? null;
  const title = normalizeTitle(
    values.get('og:title')
    ?? values.get('twitter:title')
    ?? readHtmlTitle(html),
  );

  return {
    imageUrl: imageUrl ? resolveMetadataUrl(imageUrl, pageUrl) : null,
    title,
  };
};

const parseHtmlAttributes = (tag: string) => {
  const attributes = new Map<string, string>();
  const pattern = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  for (const match of tag.matchAll(pattern)) {
    const name = match[1]?.toLowerCase();
    if (!name || name === '<meta') {
      continue;
    }
    attributes.set(name, match[2] ?? match[3] ?? match[4] ?? '');
  }
  return attributes;
};

const readHtmlTitle = (html: string) => {
  const match = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  return match?.[1] ? decodeHtmlEntities(match[1]) : null;
};

const normalizeTitle = (value: string | null | undefined) => {
  const normalized = value?.replace(/\s+/g, ' ').trim() ?? '';
  return normalized ? normalized.slice(0, titleMaxLength) : null;
};

const resolveMetadataUrl = (value: string, pageUrl: URL) => {
  try {
    return new URL(value, pageUrl).href;
  } catch {
    return null;
  }
};

export const decodeHtmlEntities = (value: string) =>
  value.replace(
    /&(?:#(\d+)|#x([\da-f]+)|amp|quot|apos|lt|gt);/gi,
    (entity, decimal: string | undefined, hexadecimal: string | undefined) => {
      if (decimal) {
        return safeCodePoint(Number(decimal), entity);
      }
      if (hexadecimal) {
        return safeCodePoint(Number.parseInt(hexadecimal, 16), entity);
      }
      return namedHtmlEntities[entity.toLowerCase()] ?? entity;
    },
  );

const namedHtmlEntities: Record<string, string> = {
  '&amp;': '&',
  '&apos;': "'",
  '&gt;': '>',
  '&lt;': '<',
  '&quot;': '"',
};

const safeCodePoint = (value: number, fallback: string) => {
  try {
    return Number.isInteger(value) ? String.fromCodePoint(value) : fallback;
  } catch {
    return fallback;
  }
};

const normalizePreviewUrl = (value: string, base?: URL) => {
  try {
    const url = new URL(value, base);
    url.hash = '';
    return (
      url.href.length <= pagePreviewUrlMaxLength
      && isAllowedPagePreviewUrl(url)
    ) ? url : null;
  } catch {
    return null;
  }
};

const isRedirectResponse = (response: PagePreviewNetworkResponse) =>
  response.status === 301
  || response.status === 302
  || response.status === 303
  || response.status === 307
  || response.status === 308;

const isHtmlContentType = (value: string) =>
  value.startsWith('text/html')
  || value.startsWith('application/xhtml+xml');

const trimCache = (cache: Map<string, CacheEntry>, limit: number) => {
  while (cache.size > Math.max(1, limit)) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) {
      return;
    }
    cache.delete(oldest);
  }
};

const withTimeout = <T>(promise: Promise<T>, timeoutMs: number) =>
  new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Page preview lookup timed out'));
    }, timeoutMs);
    void promise.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeout);
        reject(error);
      },
    );
  });

const createTaskScheduler = (limit: number) => {
  const queue: Array<() => void> = [];
  let active = 0;
  const runNext = () => {
    while (active < Math.max(1, limit) && queue.length > 0) {
      const run = queue.shift();
      if (!run) {
        return;
      }
      active += 1;
      run();
    }
  };
  return <T>(task: () => Promise<T>) => new Promise<T>((resolve, reject) => {
    queue.push(() => {
      void Promise.resolve().then(task).then(resolve, reject).finally(() => {
        active -= 1;
        runNext();
      });
    });
    runNext();
  });
};
