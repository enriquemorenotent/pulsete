import { isResourceRedirect, type ResourceLimits } from './external-resource-request.js';
import { isAllowedPagePreviewUrl, resolvePublicPagePreviewAddress, type PagePreviewNetwork } from './page-preview-network.js';

export class ResourceDownloadError extends Error {}

/** Revalidate and resolve every redirect before opening a connection. */
export async function downloadExternalResource(initialUrl: URL, options: ResourceLimits & {
  network: PagePreviewNetwork;
  maxRedirects: number;
  maxUrlLength: number;
}) {
  let url = new URL(initialUrl);
  const visited = new Set<string>();
  for (let redirects = 0; ; redirects++) {
    url.hash = '';
    if (url.href.length > options.maxUrlLength || !isAllowedPagePreviewUrl(url)) {
      throw new ResourceDownloadError('External destination is blocked');
    }
    if (visited.has(url.href)) throw new ResourceDownloadError('External content redirect loop');
    visited.add(url.href);
    const address = await resolveResourceAddress(url, options);
    if (!address) throw new ResourceDownloadError('External destination is blocked');
    const response = await options.network.request(url, address, {
      maxBytes: options.maxBytes, timeoutMs: options.timeoutMs,
      headersOnlyForImages: options.headersOnlyForImages,
    });
    if (!isResourceRedirect(response.status)) return { url, response };
    if (redirects >= options.maxRedirects) throw new ResourceDownloadError('Too many external content redirects');
    if (!response.location) throw new ResourceDownloadError('External redirect has no destination');
    try { url = new URL(response.location, url); }
    catch { throw new ResourceDownloadError('Invalid external redirect'); }
  }
}

export async function resolveResourceAddress(url: URL, options: { network: PagePreviewNetwork; timeoutMs: number }) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      resolvePublicPagePreviewAddress(url, options.network),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('External content lookup timed out')), options.timeoutMs);
      }),
    ]);
  } finally { clearTimeout(timer); }
}
