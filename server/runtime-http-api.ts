import type { RuntimeIrcService } from './runtime-irc-service.js';
import type { RuntimeNetworkSessionService } from './runtime-network-session-service.js';
import type {
  RuntimeConversationMutations,
  RuntimeFriendMutations,
  RuntimeHttpApi,
  RuntimeMutedNickMutations,
  RuntimeNetworkMutations,
} from './runtime-service-types.js';
import type { RuntimeNetworkCatalog } from './runtime-store-ports.js';

type CreateRuntimeHttpApiParams = {
  catalog: RuntimeNetworkCatalog;
  conversations: RuntimeConversationMutations;
  friends: RuntimeFriendMutations;
  mutedNicks: RuntimeMutedNickMutations;
  irc: Pick<RuntimeIrcService, 'join' | 'part' | 'sendMessage' | 'sendRaw'>;
  networks: RuntimeNetworkMutations;
  sessions: Pick<RuntimeNetworkSessionService, 'disconnect'>;
};

export const createRuntimeHttpApi = ({
  catalog,
  conversations,
  friends,
  mutedNicks,
  irc,
  networks,
  sessions,
}: CreateRuntimeHttpApiParams): RuntimeHttpApi => ({
  networks: {
    list: () => catalog.list(),
    save: (data, networkId) => networks.saveNetwork(data, networkId),
    duplicate: (networkId) => networks.duplicateNetwork(networkId),
    remove: (networkId) => networks.deleteNetwork(networkId),
    close: (networkId) => networks.closeConnection(networkId),
    connect: (networkId) => networks.connectNetwork(networkId),
    disconnect: (networkId) => sessions.disconnect(networkId),
  },
  buffers: {
    joinChannel: (networkId, channel, sourceBufferId) => irc.join(networkId, channel, sourceBufferId),
    openQuery: (networkId, target) => conversations.openQuery(networkId, target),
    close: (bufferId) => conversations.closeBuffer(bufferId),
    markRead: (bufferId) => conversations.markBufferRead(bufferId),
    saveNotes: (bufferId, notes) => conversations.saveBufferNotes(bufferId, notes),
    history: (bufferId, limit, beforeMessageId) => conversations.history(bufferId, limit, beforeMessageId),
    searchHistory: (bufferId, query, limit) => conversations.searchHistory(bufferId, query, limit),
    exportHistory: (bufferId) => conversations.exportHistory(bufferId),
  },
  friends: {
    add: (nick) => friends.upsertFriend(nick),
    remove: (friendId) => friends.removeFriend(friendId),
  },
  mutedNicks: {
    add: (networkId, nick) => mutedNicks.upsertMutedNick(networkId, nick),
    remove: (mutedNickId) => mutedNicks.removeMutedNick(mutedNickId),
  },
});
