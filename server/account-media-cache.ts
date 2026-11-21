import type { AccountMediaRoute } from './account-media-route.js';
import type { ResourceResponse } from './external-resource-request.js';

type MediaResource = { mimeType: string; body: Buffer; freshUntil: number };
type CachedImage = { resource: MediaResource; route?: AccountMediaRoute };

const byteLimit = 32 * 1024 * 1024;
const entryLimit = 256;
const ttlMs = 5 * 60 * 1000;
const images = new Map<string, CachedImage>();
const routeIds = new WeakMap<AccountMediaRoute, number>();
let nextRouteId = 0;
let cachedBytes = 0;
const deltaSecondsMs = (value: string) => Math.min(Number(value), 2 ** 31) * 1000;

export function responseFreshUntil({ cache, status }: ResourceResponse): number {
  if (!cache) return 0;
  const { headers, requestedAt, receivedAt } = cache;
  const fields = headers['cache-control']?.match(/(?:[^",]|"(?:\\.|[^"\\])*")+/g) ?? [];
  const directives = new Map<string, string[]>();
  for (const field of fields) {
    const [name, ...value] = field.split('=');
    const key = name!.trim().toLowerCase();
    const values = directives.get(key) ?? [];
    values.push(value.join('=').trim().replace(/^"(.*)"$/, '$1'));
    directives.set(key, values);
  }
  if (directives.has('no-store') || directives.has('no-cache') || directives.has('private')
    || headers.pragma?.split(',').some(value => value.trim().toLowerCase() === 'no-cache')
    || headers.vary?.split(',').some(value => value.trim() === '*')) return 0;

  const date = Date.parse(headers.date ?? '');
  const originTime = Number.isFinite(date) ? date : receivedAt;
  const maxAge = directives.get('s-maxage') ?? directives.get('max-age');
  let lifetime: number;
  if (maxAge) {
    if (maxAge.length !== 1 || !/^\d+$/.test(maxAge[0]!)) return 0;
    lifetime = deltaSecondsMs(maxAge[0]!);
  } else if (headers.expires !== undefined) {
    lifetime = Date.parse(headers.expires) - originTime;
    if (!Number.isFinite(lifetime)) return 0;
  } else {
    // Temporary redirects and responses requiring validation need explicit freshness.
    if (![200, 301, 308].includes(status) || directives.has('must-revalidate') || directives.has('proxy-revalidate')) return 0;
    lifetime = ttlMs;
  }

  const age = headers.age ?? '0';
  if (!/^\d+$/.test(age)) return 0;
  const currentAge = Math.max(receivedAt - originTime, deltaSecondsMs(age) + receivedAt - requestedAt);
  return receivedAt + Math.min(ttlMs, lifetime - currentAge);
}

function removeImage(key: string, image: CachedImage) {
  images.delete(key);
  cachedBytes -= image.resource.body.length;
}

function getRouteId(route: AccountMediaRoute) {
  const existingId = routeIds.get(route);
  if (existingId !== undefined) return existingId;

  const id = ++nextRouteId;
  routeIds.set(route, id);
  route.signal.addEventListener('abort', () => {
    for (const [key, image] of images) {
      if (image.route === route) removeImage(key, image);
    }
  }, { once: true });
  return id;
}

export async function loadAccountMedia(
  networkId: string | undefined,
  href: string,
  route: AccountMediaRoute | undefined,
  download: () => Promise<MediaResource>,
): Promise<MediaResource> {
  route?.signal.throwIfAborted();
  const key = JSON.stringify([networkId, route && getRouteId(route), href]);
  const now = Date.now();
  for (const [imageKey, image] of images) {
    if (image.resource.freshUntil <= now) removeImage(imageKey, image);
  }

  const cached = images.get(key);
  if (cached) {
    images.delete(key);
    images.set(key, cached);
    return cached.resource;
  }

  const resource = await download();
  route?.signal.throwIfAborted();
  const completedAt = Date.now();
  if (!resource.mimeType.startsWith('image/') || resource.freshUntil <= completedAt
    || resource.body.length > byteLimit) return resource;

  // Another request for the same image may have finished while this one was downloading.
  const existing = images.get(key);
  if (existing && existing.resource.freshUntil > completedAt) return resource;
  if (existing) removeImage(key, existing);

  images.set(key, { resource, route });
  cachedBytes += resource.body.length;
  for (const [oldestKey, oldest] of images) {
    if (cachedBytes <= byteLimit && images.size <= entryLimit) break;
    removeImage(oldestKey, oldest);
  }
  return resource;
}
