import type { NetworkProfile } from '../../shared/protocol-chat.js';
import { resolveIrcCloudAvatarUrl } from './user-avatars/irccloud.js';

export type NetworkServerImageSource = 'explicit' | 'irccloud-fallback';

export type NetworkServerImage = {
  source: NetworkServerImageSource;
  url: string;
};

export const resolveNetworkServerImage = (
  network: Pick<NetworkProfile, 'iconUrl' | 'username'>,
  externalAvatarsEnabled: boolean,
): NetworkServerImage | null => {
  const iconUrl = network.iconUrl?.trim();
  if (iconUrl) {
    return { source: 'explicit', url: iconUrl };
  }
  if (!externalAvatarsEnabled) {
    return null;
  }
  const fallbackUrl = resolveIrcCloudAvatarUrl({
    host: null,
    username: network.username ?? null,
  });
  return fallbackUrl ? { source: 'irccloud-fallback', url: fallbackUrl } : null;
};

export const resolveNetworkServerImageUrl = (
  network: Pick<NetworkProfile, 'iconUrl' | 'username'>,
  externalAvatarsEnabled: boolean,
) => resolveNetworkServerImage(network, externalAvatarsEnabled)?.url ?? null;

export const isNetworkServerImageFallback = (
  image: NetworkServerImage | null,
) => image?.source === 'irccloud-fallback';
