import { extractIrcCloudAvatarId } from '../shared/irccloud-avatar.js';
import { badRequest } from './app-error.js';
import type { RouteArgs } from './http-types.js';
import { createAccountMediaNetwork } from './account-media-network.js';
import { getAccountMediaRoute, type AccountMediaRoute } from './account-media-route.js';
import { createPagePreviewResolver, type PagePreviewResolver } from './page-preview-resolver.js';
import { isAllowedPagePreviewUrl, resolvePublicPagePreviewAddress } from './page-preview-network.js';

const resolvers = new Map<string, { route?: AccountMediaRoute; resolver: PagePreviewResolver }>();

export function accountMediaAccess(context: RouteArgs['context'], networkId?: string) {
  const networks = context.networks.list();
  const network = networkId ? networks.find(item => item.id === networkId) : undefined;
  if (networkId && !network) throw badRequest('Unknown media account');
  if (!networkId && networks.some(item => item.nordVpnLocation)) throw badRequest('Choose an account to load external content');
  let route: AccountMediaRoute | undefined;
  if (network?.nordVpnLocation) {
    try { route = getAccountMediaRoute(network.id, network.nordVpnLocation); }
    catch { throw badRequest('Connect this account’s VPN to load external content'); }
  }
  return { route, network: createAccountMediaNetwork(route) };
}

export function accountPreviewResolver(context: RouteArgs['context'], networkId: string | undefined, fallback: PagePreviewResolver) {
  const { route, network } = accountMediaAccess(context, networkId);
  if (!networkId) return fallback;
  const cached = resolvers.get(networkId);
  if (cached && cached.route === route) return cached.resolver;
  const resolver = createPagePreviewResolver({ network });
  resolvers.set(networkId, { route, resolver });
  if (resolvers.size > 64) resolvers.delete(resolvers.keys().next().value!);
  return resolver;
}

export async function handleAccountMediaRoutes({ req, res, url, pathname, context }: RouteArgs) {
  if (pathname !== '/api/media/resource' || req.method !== 'GET') return false;
  res.setHeader('Cache-Control', 'no-store');
  const input = url.searchParams.get('url');
  if (!input || input.length > 2048) throw badRequest('Invalid media URL');
  const networkId = url.searchParams.get('networkId') || undefined;
  const account = networkId ? context.networks.list().find(item => item.id === networkId) : undefined;
  const avatarId = extractIrcCloudAvatarId(account?.username);
  const accountImageUrl = account?.iconUrl?.trim()
    || (avatarId ? `https://static.irccloud-cdn.com/avatar-redirect/${avatarId}` : null);
  // Only the account's current picture can use the persistent offline cache.
  const cacheable = account && input === accountImageUrl;
  const cached = cacheable ? context.networks.getAccountImage(account.id, input) : undefined;
  const sendImage = (mimeType: string, body: Buffer) => {
    res.setHeader('Content-Type', mimeType);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.end(body);
    return true;
  };
  if (cached && Date.now() - cached.updatedAt < 24 * 60 * 60 * 1000) {
    return sendImage(cached.mimeType, cached.imageData);
  }
  try {
    const { network } = accountMediaAccess(context, networkId);
    const image = await downloadAccountMedia(input, network);
    if (cacheable && image.mimeType.startsWith('image/')) {
      context.networks.saveAccountImage(account.id, input, image.mimeType, image.body);
    }
    return sendImage(image.mimeType, image.body);
  } catch (error) {
    if (cached) return sendImage(cached.mimeType, cached.imageData);
    throw error;
  }
}

async function downloadAccountMedia(input: string, network: ReturnType<typeof createAccountMediaNetwork>) {
  let target: URL;
  try { target = new URL(input); } catch { throw badRequest('Invalid media URL'); }
  for (let redirects = 0; redirects <= 3; redirects++) {
    if (!isAllowedPagePreviewUrl(target)) throw badRequest('Media destination is blocked');
    const address = await resolvePublicPagePreviewAddress(target, network);
    if (!address) throw badRequest('Media destination is blocked');
    const response = await network.request(target, address, { maxBytes: 20 * 1024 * 1024, timeoutMs: 15000 });
    if ([301,302,303,307,308].includes(response.status) && response.location) {
      target = new URL(response.location, target);
      continue;
    }
    const type = response.contentType.split(';')[0]!.trim();
    // Never serve HTML, SVG, playlists, or other content that can fetch nested URLs.
    if (response.status !== 200 || !/^(image\/(png|jpeg|gif|webp|avif)|video\/(mp4|webm|ogg|quicktime))$/.test(type)) throw badRequest('Unsupported external media');
    return { mimeType: type, body: response.body };
  }
  throw badRequest('Too many media redirects');
}
