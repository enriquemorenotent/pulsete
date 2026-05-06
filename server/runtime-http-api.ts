import type { RuntimeIrcService } from './runtime-irc-service.js';
import type { RuntimeNetworkSessionService } from './runtime-network-session-service.js';
import type {
  RuntimeConversationMutations,
  RuntimeDebugApi,
  RuntimeFriendMutations,
  RuntimeHttpApi,
  RuntimeMutedNickMutations,
  RuntimeNickEmojiMutations,
  RuntimeNetworkMutations,
} from './runtime-service-types.js';
import type { RuntimeNetworkCatalog } from './runtime-store-ports.js';

type CreateRuntimeHttpApiParams = {
  catalog: RuntimeNetworkCatalog;
  conversations: RuntimeConversationMutations;
  debug: RuntimeDebugApi;
  friends: RuntimeFriendMutations;
  mutedNicks: RuntimeMutedNickMutations;
  nickEmojis: RuntimeNickEmojiMutations;
  irc: Pick<RuntimeIrcService, 'join' | 'part' | 'sendMessage' | 'sendRaw'>;
  networks: RuntimeNetworkMutations;
  sessions: Pick<RuntimeNetworkSessionService, 'disconnect'>;
};

export const createRuntimeHttpApi = ({
  catalog,
  conversations,
  debug,
  friends,
  mutedNicks,
  nickEmojis,
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
    openQuery: (networkId, target, peerIdentity) => conversations.openQuery(networkId, target, peerIdentity),
    close: (bufferId) => conversations.closeBuffer(bufferId),
    clearHistory: (bufferId) => conversations.clearBufferHistory(bufferId),
    markRead: (bufferId) => conversations.markBufferRead(bufferId),
    saveNotes: (bufferId, notes) => conversations.saveBufferNotes(bufferId, notes),
    history: (bufferId, limit, beforeMessageId) => conversations.history(bufferId, limit, beforeMessageId),
    searchHistory: (bufferId, query, limit) => conversations.searchHistory(bufferId, query, limit),
    exportHistory: (bufferId) => conversations.exportHistory(bufferId),
  },
  logs: {
    search: (query, limit, filters) => conversations.searchLogs(query, limit, filters),
  },
  debug: {
    memory: () => debug.memory(),
  },
  friends: {
    add: (nick) => friends.upsertFriend(nick),
    remove: (friendId) => friends.removeFriend(friendId),
  },
  nickEmojis: {
    save: (networkId, nick, emoji, identity) => nickEmojis.saveNickEmoji(networkId, nick, emoji, identity),
  },
  mutedNicks: {
    add: (networkId, nick, identity) => mutedNicks.upsertMutedNick(networkId, nick, identity),
    remove: (mutedNickId) => mutedNicks.removeMutedNick(mutedNickId),
  },
});
