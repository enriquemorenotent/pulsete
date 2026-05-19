import type { NetworkProfile } from '../../shared/protocol-chat.js';
import { resolveIrcCloudAvatarUrl } from './user-avatars/irccloud.js';

export const resolveNetworkServerImageUrl = (
  network: Pick<NetworkProfile, 'iconUrl' | 'username'>,
  externalAvatarsEnabled: boolean,
) => {
  const iconUrl = network.iconUrl?.trim();
  if (iconUrl) {
    return iconUrl;
  }
  if (!externalAvatarsEnabled) {
    return null;
  }
  return resolveIrcCloudAvatarUrl({
    host: null,
    username: network.username ?? null,
  });
};
