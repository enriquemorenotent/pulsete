import { isConnectionInstance } from '../shared/network-model.js';
import type { NetworkProfile } from '../shared/protocol.js';
import type { NetworkInput, Storage } from './storage.js';

export const listRelatedNetworkIds = (store: Storage, networkId: string) =>
  store
    .listNetworks()
    .filter((candidate) => candidate.id === networkId || (isConnectionInstance(candidate) && candidate.templateId === networkId))
    .map((candidate) => candidate.id);

export const syncTemplateInstances = (
  store: Storage,
  profile: NetworkProfile,
  input: NetworkInput
) => {
  if (isConnectionInstance(profile)) {
    return [];
  }
  return store
    .listNetworks()
    .filter((candidate) => isConnectionInstance(candidate) && candidate.templateId === profile.id)
    .map((candidate) =>
      store.upsertNetwork({
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
