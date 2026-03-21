import { isConnectionInstance } from '../shared/network-model.js';
import type { NetworkProfile, ServerMessage } from '../shared/protocol.js';
import type { Storage } from './storage.js';

export const collectRequestedServerBuffer = (
  store: Storage,
  requestedNetworkId: string,
  profiles: NetworkProfile[]
) => {
  for (const profile of profiles) {
    if (!isConnectionInstance(profile)) {
      continue;
    }
    const serverBuffer = store.getServerBuffer(profile.id);
    if (profile.id === requestedNetworkId) {
      return serverBuffer;
    }
  }
  return null;
};

export const createNetworkUpsertMessages = (store: Storage, profiles: NetworkProfile[]) => {
  const messages: ServerMessage[] = [];
  for (const profile of profiles) {
    if (isConnectionInstance(profile)) {
      const serverBuffer = store.getServerBuffer(profile.id);
      if (serverBuffer) {
        messages.push({ type: 'buffer.upsert', buffer: serverBuffer });
      }
    }
    messages.push({ type: 'network.upsert', network: profile });
  }
  return messages;
};

export const createNetworkRemoveMessages = (networkIds: readonly string[]) =>
  networkIds.map((networkId) => ({ type: 'network.remove', networkId } satisfies ServerMessage));
