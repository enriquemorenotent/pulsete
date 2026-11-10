import { AsyncResultCache } from '../../shared/async-result-cache.js';
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

type PagePreviewUnavailableState = {
  href: string;
  reason: PagePreviewUnavailableReason | null;
};

const pagePreviewCacheLimit = 256;
const pagePreviewCacheTtlMs = 6 * 60 * 60 * 1_000;
const pagePreviewNegativeCacheTtlMs = 15 * 60 * 1_000;
const pagePreviewCache = new AsyncResultCache<string, ResolvedPagePreview>({
  limit: pagePreviewCacheLimit,
  ttlMs: result => result.media ? pagePreviewCacheTtlMs : pagePreviewNegativeCacheTtlMs,
});

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
  return pagePreviewCache.get(cacheKey, () => api.resolvePagePreview(href, { networkId })
    .then(({ preview, unavailableReason }) => ({
      media: preview ? pagePreviewToInlineMedia(href, preview) : null,
      unavailableReason,
    }))
    .catch(() => silentPagePreviewResult));
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
