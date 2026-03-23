import type { RuntimeIrcService } from './runtime-irc-service.js';
import type { RuntimeNetworkSessionService } from './runtime-network-session-service.js';
import type {
  RuntimeAssistantApi,
  RuntimeConversationMutations,
  RuntimeFriendMutations,
  RuntimeHttpApi,
  RuntimeNetworkMutations,
} from './runtime-service-types.js';
import type { RuntimeNetworkCatalog } from './runtime-store-ports.js';

type CreateRuntimeHttpApiParams = {
  assistant: RuntimeAssistantApi;
  catalog: RuntimeNetworkCatalog;
  conversations: RuntimeConversationMutations;
  friends: RuntimeFriendMutations;
  irc: Pick<RuntimeIrcService, 'join' | 'part' | 'sendMessage' | 'sendRaw'>;
  networks: RuntimeNetworkMutations;
  sessions: RuntimeNetworkSessionService;
};

export const createRuntimeHttpApi = ({
  assistant,
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
  assistant: {
    startChatgptLogin: () => assistant.startChatgptLogin(),
    cancelLogin: (loginId) => assistant.cancelLogin(loginId),
    logout: () => assistant.logout(),
    createThread: (input) => assistant.createThread(input),
    readThread: (threadId) => assistant.readThread(threadId),
    startTurn: (input) => assistant.startTurn(input),
    interruptTurn: (threadId, turnId) => assistant.interruptTurn(threadId, turnId),
    updatePreferences: (input) => assistant.updatePreferences(input),
  },
});
