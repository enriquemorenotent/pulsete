import type { AccountMediaRoute } from './account-media-route.js';
import type { ResourceResponse } from './external-resource-request.js';

type MediaResource = { mimeType: string; body: Buffer; freshUntil: number };
type CachedMedia = { resource: MediaResource; route?: AccountMediaRoute; expiryTimer: ReturnType<typeof setTimeout> };
type MediaCache = { entries: Map<string, CachedMedia>; bytes: number; byteLimit: number };

const mib = 1024 * 1024;
const entryLimit = 256;
const ttlMs = 5 * 60 * 1000;
const images: MediaCache = { entries: new Map(), bytes: 0, byteLimit: 32 * mib };
const loopingVideos: MediaCache = { entries: new Map(), bytes: 0, byteLimit: 16 * mib };
const loopingVideoSizeLimit = 4 * mib;
const routeIds = new WeakMap<AccountMediaRoute, number>();
let nextRouteId = 0;
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

function removeCachedMedia(cache: MediaCache, key: string, entry: CachedMedia) {
  clearTimeout(entry.expiryTimer);
  cache.entries.delete(key);
  cache.bytes -= entry.resource.body.length;
}

function readCachedMedia(cache: MediaCache, key: string, now: number) {
  for (const [entryKey, entry] of cache.entries) {
    if (entry.resource.freshUntil <= now) removeCachedMedia(cache, entryKey, entry);
  }

  const cached = cache.entries.get(key);
  if (cached) {
    cache.entries.delete(key);
    cache.entries.set(key, cached);
  }
  return cached?.resource;
}

function getRouteId(route: AccountMediaRoute) {
  const existingId = routeIds.get(route);
  if (existingId !== undefined) return existingId;

  const id = ++nextRouteId;
  routeIds.set(route, id);
  route.signal.addEventListener('abort', () => {
    for (const cache of [images, loopingVideos]) {
      for (const [key, entry] of cache.entries) {
        if (entry.route === route) removeCachedMedia(cache, key, entry);
      }
    }
  }, { once: true });
  return id;
}

export async function loadAccountMedia(
  networkId: string | undefined,
  href: string,
  route: AccountMediaRoute | undefined,
  download: () => Promise<MediaResource>,
  cacheLoopingVideo = false,
): Promise<MediaResource> {
  route?.signal.throwIfAborted();
  const key = JSON.stringify([networkId, route && getRouteId(route), href]);
  const now = Date.now();
  const cached = readCachedMedia(images, key, now)
    ?? (cacheLoopingVideo ? readCachedMedia(loopingVideos, key, now) : undefined);
  if (cached) return cached;

  const resource = await download();
  route?.signal.throwIfAborted();
  const completedAt = Date.now();
  if (resource.freshUntil <= completedAt) return resource;

  let cache: MediaCache;
  if (resource.mimeType.startsWith('image/') && resource.body.length <= images.byteLimit) {
    cache = images;
  } else if (cacheLoopingVideo && resource.mimeType.startsWith('video/') && resource.body.length <= loopingVideoSizeLimit) {
    cache = loopingVideos;
  } else {
    return resource;
  }

  // Another request for the same media may have finished while this one was downloading.
  const existing = cache.entries.get(key);
  if (existing && existing.resource.freshUntil > completedAt) return resource;
  if (existing) removeCachedMedia(cache, key, existing);

  const expiryTimer = setTimeout(() => removeCachedMedia(cache, key, entry), resource.freshUntil - completedAt);
  expiryTimer.unref();
  const entry = { resource, route, expiryTimer };
  cache.entries.set(key, entry);
  cache.bytes += resource.body.length;
  for (const [oldestKey, oldest] of cache.entries) {
    if (cache.bytes <= cache.byteLimit && cache.entries.size <= entryLimit) break;
    removeCachedMedia(cache, oldestKey, oldest);
  }
  return resource;
}
