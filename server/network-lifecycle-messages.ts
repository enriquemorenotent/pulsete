import { isConnectionInstance } from '../shared/network-model.js';
import type { NetworkProfile, ServerMessage } from '../shared/protocol.js';
import type { StorageConversationsRepository } from './storage-conversations-repository.js';

export const collectRequestedServerBuffer = (
  conversations: StorageConversationsRepository,
  requestedNetworkId: string,
  profiles: NetworkProfile[]
) => {
  for (const profile of profiles) {
    if (!isConnectionInstance(profile)) {
      continue;
    }
    const serverBuffer = conversations.getServerBuffer(profile.id);
    if (profile.id === requestedNetworkId) {
      return serverBuffer;
    }
  }
  return null;
};

export const createNetworkUpsertMessages = (
  conversations: StorageConversationsRepository,
  profiles: NetworkProfile[]
) => {
  const messages: ServerMessage[] = [];
  for (const profile of profiles) {
    if (isConnectionInstance(profile)) {
      const serverBuffer = conversations.getServerBuffer(profile.id);
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
