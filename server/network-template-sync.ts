import { isConnectionInstance } from '../shared/network-model.js';
import type { NetworkProfile } from '../shared/protocol.js';
import type { StorageNetworksRepository } from './storage-networks-repository.js';
import type { NetworkInput } from './storage-types.js';

export const listRelatedNetworkIds = (networks: StorageNetworksRepository, networkId: string) =>
  networks
    .list()
    .filter((candidate) => candidate.id === networkId || (isConnectionInstance(candidate) && candidate.templateId === networkId))
    .map((candidate) => candidate.id);

export const syncTemplateInstances = (
  networks: StorageNetworksRepository,
  profile: NetworkProfile,
  input: NetworkInput
) => {
  if (isConnectionInstance(profile)) {
    return [];
  }
  return networks
    .list()
    .filter((candidate) => isConnectionInstance(candidate) && candidate.templateId === profile.id)
    .map((candidate) =>
      networks.upsert({
        id: candidate.id,
        templateId: profile.id,
        managerHidden: true,
        name: profile.name,
        host: profile.host,
        port: profile.port,
        tls: profile.tls,
        nick: profile.nick,
        altNicks: profile.altNicks,
        username: profile.username,
        realName: profile.realName,
        favorite: profile.favorite,
        autoJoin: profile.autoJoin,
        ...(input.password !== undefined ? { password: input.password } : {}),
        ...(input.clearPassword ? { clearPassword: true } : {}),
      })
    );
};
