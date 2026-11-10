import { AsyncResultCache } from '../shared/async-result-cache.js';
import { downloadExternalResource, resolveResourceAddress } from './external-resource-download.js';
import {
  pagePreviewUrlMaxLength,
  type PagePreviewResponse,
  type PagePreviewUnavailableReason,
} from '../shared/protocol-page-preview.js';
import {
  defaultPagePreviewNetwork,
  isAllowedPagePreviewUrl,
  type PagePreviewNetwork,
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
  const cache = new AsyncResultCache<string, PagePreviewResponse>({
    limit: Math.max(1, options.cacheLimit ?? defaultCacheLimit),
    ttlMs: result => result.preview
      ? options.ttlMs ?? defaultTtlMs
      : options.negativeTtlMs ?? defaultNegativeTtlMs,
  });
  const network = options.network ?? defaultPagePreviewNetwork;
  const schedule = createTaskScheduler(options.concurrency ?? defaultConcurrency);

  return {
    async resolve(input) {
      const url = normalizePreviewUrl(input);
      if (!url) {
        return unavailablePagePreview();
      }
      return cache.get(url.href, () => schedule(() =>
        resolvePagePreview(url, {
          maxBytes: options.maxBytes ?? defaultMaxBytes,
          maxRedirects: options.maxRedirects ?? defaultMaxRedirects,
          network,
          timeoutMs: options.timeoutMs ?? defaultTimeoutMs,
        })).catch(() => unavailablePagePreview()));
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
  const { url: pageUrl, response } = await downloadExternalResource(initialUrl, {
    ...options, maxUrlLength: pagePreviewUrlMaxLength, headersOnlyForImages: true,
  });
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
    || !await resolveResourceAddress(imageUrl, options)
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
};

const unavailablePagePreview = (
  unavailableReason: PagePreviewUnavailableReason | null = null,
): PagePreviewResponse => ({
  preview: null,
  unavailableReason,
});

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

const isHtmlContentType = (value: string) =>
  value.startsWith('text/html')
  || value.startsWith('application/xhtml+xml');

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
