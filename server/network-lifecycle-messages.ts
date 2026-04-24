import type { StoredNetworkProfile } from '../shared/network-model.js';
import type { ServerMessage } from '../shared/protocol.js';
import type { RuntimeConversationStore } from './runtime-store-ports.js';

export const collectRequestedServerBuffer = (
  conversations: Pick<RuntimeConversationStore, 'getServerBuffer'>,
  profile: StoredNetworkProfile
) => {
  if (profile.workspaceOpen) {
    return conversations.getServerBuffer(profile.id);
  }
  return null;
};

export const createNetworkUpsertMessages = (
  conversations: Pick<RuntimeConversationStore, 'getServerBuffer'>,
  profiles: readonly StoredNetworkProfile[]
) => {
  const messages: ServerMessage[] = [];
  for (const profile of profiles) {
    if (profile.workspaceOpen) {
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
