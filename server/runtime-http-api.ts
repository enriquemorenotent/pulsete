import type { RuntimeIrcService } from './runtime-irc-service.js';
import type { RuntimeNetworkSessionService } from './runtime-network-session-service.js';
import type { StorageNetworksRepository } from './storage-networks-repository.js';
import type {
  RuntimeConversationMutations,
  RuntimeFriendMutations,
  RuntimeHttpApi,
  RuntimeNetworkMutations,
} from './runtime-service-types.js';

type CreateRuntimeHttpApiParams = {
  catalog: Pick<StorageNetworksRepository, 'list'>;
  conversations: RuntimeConversationMutations;
  friends: RuntimeFriendMutations;
  irc: Pick<RuntimeIrcService, 'join' | 'part' | 'sendMessage' | 'sendRaw'>;
  networks: RuntimeNetworkMutations;
  sessions: RuntimeNetworkSessionService;
};

export const createRuntimeHttpApi = ({
  catalog,
  conversations,
  friends,
  irc,
  networks,
  sessions,
}: CreateRuntimeHttpApiParams): RuntimeHttpApi => ({
  networks: {
    list: () => catalog.list(),
    save: (data, networkId) => networks.saveNetwork(data, networkId),
    duplicate: (networkId) => networks.duplicateNetwork(networkId),
    remove: (networkId) => networks.deleteNetwork(networkId),
    connect: (networkId) => sessions.connect(networkId),
    disconnect: (networkId) => sessions.disconnect(networkId),
  },
  buffers: {
    joinChannel: (networkId, channel, sourceBufferId) => irc.join(networkId, channel, sourceBufferId),
    openQuery: (networkId, target) => conversations.openQuery(networkId, target),
    close: (bufferId) => conversations.closeBuffer(bufferId),
    markRead: (bufferId) => conversations.markBufferRead(bufferId),
    history: (bufferId, limit) => conversations.history(bufferId, limit),
  },
  friends: {
    add: (nick) => friends.upsertFriend(nick),
    remove: (friendId) => friends.removeFriend(friendId),
  },
});
