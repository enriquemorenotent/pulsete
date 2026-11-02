import { useMediaAccount } from './account-media.js';
import { useEffect, useState } from 'react';
import type {
  PagePreview,
  PagePreviewUnavailableReason,
} from '../../shared/protocol-page-preview.js';
import { api } from './client.js';
import type { InlineMedia } from './formatted-message-inline-media.js';

type PagePreviewMediaState = {
  key: string;
  media: InlineMedia[];
};

export type ResolvedPagePreview = {
  media: InlineMedia | null;
  unavailableReason: PagePreviewUnavailableReason | null;
};

type PagePreviewCacheEntry = {
  expiresAt: number;
  promise: Promise<ResolvedPagePreview>;
};

type PagePreviewUnavailableState = {
  href: string;
  reason: PagePreviewUnavailableReason | null;
};

const pagePreviewCache = new Map<string, PagePreviewCacheEntry>();
const pagePreviewCacheLimit = 256;
const pagePreviewCacheTtlMs = 6 * 60 * 60 * 1_000;
const pagePreviewNegativeCacheTtlMs = 15 * 60 * 1_000;

export const pagePreviewToInlineMedia = (
  originalHref: string,
  preview: PagePreview,
): InlineMedia => ({
  kind: 'image',
  label: preview.title ?? undefined,
  originalHref,
  sourceHref: preview.imageUrl,
});

export const resolvePagePreviewResult = (href: string, networkId?: string, scope = '') => {
  const cacheKey = JSON.stringify([networkId, scope, href]);
  const cached = pagePreviewCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.promise;
  }
  if (cached) {
    pagePreviewCache.delete(cacheKey);
  }
  const entry: PagePreviewCacheEntry = {
    expiresAt: Number.POSITIVE_INFINITY,
    promise: Promise.resolve(silentPagePreviewResult),
  };
  entry.promise = api.resolvePagePreview(href, { networkId })
    .then(({ preview, unavailableReason }) => ({
      media: preview ? pagePreviewToInlineMedia(href, preview) : null,
      unavailableReason,
    }))
    .catch(() => silentPagePreviewResult)
    .then((result) => {
      entry.expiresAt = Date.now() + (
        result.media ? pagePreviewCacheTtlMs : pagePreviewNegativeCacheTtlMs
      );
      return result;
    });
  pagePreviewCache.set(cacheKey, entry);
  trimPagePreviewCache();
  return entry.promise;
};

export const resolvePagePreviewMedia = (href: string) =>
  resolvePagePreviewResult(href).then((result) => result.media);

export const usePagePreviewMedia = (hrefs: readonly string[]) => {
  const account = useMediaAccount();
  const key = account.cacheKey + '\n' + hrefs.join('\n');
  const [state, setState] = useState<PagePreviewMediaState>({
    key: '',
    media: [],
  });

  useEffect(() => {
    let active = true;
    if (!hrefs.length) {
      setState({ key, media: [] });
      return () => {
        active = false;
      };
    }
    void Promise.all(hrefs.map(href => resolvePagePreviewResult(href, account.networkId, account.cacheKey))).then((resolved) => {
      if (!active) {
        return;
      }
      setState({
        key,
        media: resolved
          .map((result) => result.media)
          .filter((media): media is InlineMedia => media !== null),
      });
    });
    return () => {
      active = false;
    };
  }, [key]);

  return state.key === key ? state.media : [];
};

export const usePagePreviewUnavailableReason = (href: string) => {
  const account = useMediaAccount();
  const key = account.cacheKey + href;
  const [state, setState] = useState<PagePreviewUnavailableState>({
    href: '',
    reason: null,
  });

  useEffect(() => {
    let active = true;
    void resolvePagePreviewResult(href, account.networkId, account.cacheKey).then((result) => {
      if (active) {
        setState({ href: key, reason: result.unavailableReason });
      }
    });
    return () => {
      active = false;
    };
  }, [key]);

  return state.href === key ? state.reason : null;
};

const silentPagePreviewResult: ResolvedPagePreview = {
  media: null,
  unavailableReason: null,
};

const trimPagePreviewCache = () => {
  while (pagePreviewCache.size > pagePreviewCacheLimit) {
    const oldest = pagePreviewCache.keys().next().value;
    if (oldest === undefined) {
      return;
    }
    pagePreviewCache.delete(oldest);
  }
};
