import type { ServerMessage } from '../shared/protocol-messages.js';
import { RuntimeAiAssistantService } from './runtime-ai-assistant-service.js';
import { NetworkLifecycleService } from './network-lifecycle-service.js';
import { RuntimeConnectionManager } from './runtime-connection-manager.js';
import { RuntimeConversationService } from './runtime-conversation-service.js';
import { RuntimeEventRouter } from './runtime-event-router.js';
import { RuntimeFriendService } from './runtime-friend-service.js';
import { createRuntimeGateway } from './runtime-gateway.js';
import { createRuntimeHttpServices } from './runtime-http-service-builder.js';
import { RuntimeIrcService } from './runtime-irc-service.js';
import { RuntimeMutedNickService } from './runtime-muted-nick-service.js';
import { RuntimeNickEmojiService } from './runtime-nick-emoji-service.js';
import { RuntimeNetworkSessionService } from './runtime-network-session-service.js';
import { RuntimePublisher } from './runtime-publisher.js';
import type {
  RuntimeConversationMutations,
  RuntimeFriendMutations,
  RuntimeMutedNickMutations,
  RuntimeNickEmojiMutations,
  RuntimeNetworkMutations,
  RuntimeServices,
  RuntimeStore,
} from './runtime-service-types.js';
import { createMutationPublisher } from './runtime-mutation-messages.js';
import { RuntimeSocketHub } from './runtime-socket-hub.js';
import { createRuntimeWebSocketApi } from './runtime-websocket-api.js';
import { createRuntimeUserStateServices } from './runtime-user-state-service.js';

export const createRuntimeServices = (store: RuntimeStore): RuntimeServices => {
  let closing = false;

  const socketHub = new RuntimeSocketHub();
  const publisher = new RuntimePublisher(socketHub);
  const publishMutation = createMutationPublisher((messages) => publisher.publish(messages));
  const { avatarOverrides, drafts, preferences } = createRuntimeUserStateServices(
    store,
    publishMutation,
  );
  const conversationsService = new RuntimeConversationService({
    conversations: store.conversations,
    mutedNicks: store.mutedNicks,
    networks: store.networks,
  });
  const assistantService = new RuntimeAiAssistantService({
    conversations: store.conversations,
  });
  const eventRouter = new RuntimeEventRouter({
    buffers: store.conversations,
    conversations: conversationsService,
    friends: store.friends,
    publish: (messages) => publisher.publish(messages),
    sendSocket: (ws, message) => publisher.sendSocket(ws, message),
  });
  const connectionManager = new RuntimeConnectionManager({
    conversations: store.conversations,
    eventRouter,
    friends: store.friends,
    networks: store.networks,
    isClosing: () => closing,
  });
  socketHub.setDropHandler((ws) => connectionManager.removeSocket(ws));

  const friendMutations = new RuntimeFriendService({
    connectionManager,
    friends: store.friends,
  });
  const mutedNickMutations = new RuntimeMutedNickService({
    conversations: store.conversations,
    mutedNicks: store.mutedNicks,
    networks: store.networks,
  });
  const nickEmojiMutations = new RuntimeNickEmojiService({
    networks: store.networks,
    nickEmojis: store.nickEmojis,
  });
  const irc = new RuntimeIrcService({
    connectionManager,
    conversations: store.conversations,
    networks: store.networks,
  });
  const networkMutations = new NetworkLifecycleService({
    conversations: store.conversations,
    connectionManager,
    networks: store.networks,
  });
  const sessions = new RuntimeNetworkSessionService({
    connectionManager,
    conversations: store.conversations,
    networks: store.networks,
  });
  const closeGateway = () => {
    closing = true;
    socketHub.closeAll();
    connectionManager.close();
  };
  const gateway = createRuntimeGateway({
    connectionManager,
    onClose: closeGateway,
    publisher,
    socketHub,
    store,
  });
  const conversations: RuntimeConversationMutations = {
    openQuery: (networkId, target, peerIdentity) => {
      const currentNick = connectionManager.getConnectionState(networkId)?.nick ?? null;
      const result = conversationsService.openQuery(networkId, target, peerIdentity, currentNick);
      connectionManager.syncPresenceTracking(networkId);
      const messages: ServerMessage[] = [
        ...result.messages,
        ...connectionManager.collectFriendPresenceDiffs(),
      ];
      return publishMutation({
        ...result,
        messages,
      });
    },
    closeBuffer: (bufferId) => {
      const result = conversationsService.closeBuffer(bufferId);
      if (result.buffer.kind === 'channel') {
        connectionManager.closeChannelBuffer(result.buffer.networkId, result.buffer.target);
      }
      connectionManager.syncPresenceTracking(result.buffer.networkId);
      const messages: ServerMessage[] = [
        ...connectionManager.collectFriendPresenceDiffs(),
        ...result.messages,
      ];
      return publishMutation({
        ...result,
        messages,
      });
    },
    clearBufferHistory: (bufferId) => publishMutation(conversationsService.clearBufferHistory(bufferId)),
    markBufferRead: (bufferId) => publishMutation(conversationsService.markBufferRead(bufferId)),
    saveBufferNotes: (bufferId, notes) => publishMutation(conversationsService.saveBufferNotes(bufferId, notes)),
    history: (bufferId, limit, beforeMessageId) => conversationsService.listBufferHistory(bufferId, limit, beforeMessageId),
    searchHistory: (bufferId, query, limit) => conversationsService.searchBufferHistory(bufferId, query, limit),
    searchLogs: (query, limit, filters) => conversationsService.searchLogs(query, limit, filters),
    listLogSources: (filters, limit) => conversationsService.listLogSources(filters, limit),
    exportHistory: (bufferId) => conversationsService.exportBufferHistory(bufferId),
  };
  const friends: RuntimeFriendMutations = {
    upsertFriend: (nick) => publishMutation(friendMutations.upsertFriend(nick)),
    removeFriend: (friendId) => publishMutation(friendMutations.removeFriend(friendId)),
  };
  const mutedNicks: RuntimeMutedNickMutations = {
    upsertMutedNick: (networkId, nick, identity) =>
      publishMutation(mutedNickMutations.upsertMutedNick(networkId, nick, identity)),
    removeMutedNick: (mutedNickId) => publishMutation(mutedNickMutations.removeMutedNick(mutedNickId)),
  };
  const nickEmojis: RuntimeNickEmojiMutations = {
    saveNickEmoji: (networkId, nick, emoji, identity) =>
      publishMutation(nickEmojiMutations.saveNickEmoji(networkId, nick, emoji, identity)),
  };
  const networks: RuntimeNetworkMutations = {
    saveNetwork: (data, networkId) => publishMutation(networkMutations.saveNetwork(data, networkId)),
    duplicateNetwork: (networkId) => publishMutation(networkMutations.duplicateNetwork(networkId)),
    deleteNetwork: (networkId) => {
      const result = networkMutations.deleteNetwork(networkId);
      const nextPreferences = store.preferences.get();
      return publishMutation({
        ...result,
        messages: [
          ...result.messages,
          { type: 'preferences.updated', preferences: nextPreferences },
        ],
      });
    },
    connectNetwork: (networkId) => {
      const opened = networkMutations.openConnection(networkId);
      const result = publishMutation({
        network: opened.network,
        serverBuffer: opened.serverBuffer,
        messages: opened.messages,
      });
      if (opened.shouldConnect) {
        sessions.connect(opened.network.id);
      }
      return result;
    },
    closeConnection: (networkId) => publishMutation(networkMutations.closeConnection(networkId)),
  };
  const http = createRuntimeHttpServices({
    assistant: assistantService,
    catalog: store.networks,
    conversations,
    friends,
    mutedNicks,
    nickEmojis,
    irc,
    networks,
    sessions,
    preferences,
    drafts,
    avatarOverrides,
  });
  const ws = createRuntimeWebSocketApi({
    attachSocket: (ws) => gateway.attachSocket(ws),
    detachSocket: (ws) => gateway.detachSocket(ws),
    http,
    irc,
    sessions,
    snapshot: () => gateway.snapshot(),
  });

  return {
    connections: connectionManager.connections,
    gateway,
    sessions,
    conversations,
    friends,
    mutedNicks,
    nickEmojis,
    irc,
    networks,
    preferences,
    drafts,
    avatarOverrides,
    http,
    ws,
  };
};
