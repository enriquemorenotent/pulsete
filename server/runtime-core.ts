import { randomUUID } from 'node:crypto';
import type { ServerMessage } from '../shared/protocol.js';
import { AssistantService } from './assistant-service.js';
import { NetworkLifecycleService } from './network-lifecycle-service.js';
import { RuntimeConnectionManager } from './runtime-connection-manager.js';
import { RuntimeConversationService } from './runtime-conversation-service.js';
import { RuntimeEventRouter } from './runtime-event-router.js';
import { RuntimeFriendService } from './runtime-friend-service.js';
import { createRuntimeHttpApi } from './runtime-http-api.js';
import { RuntimeIrcService } from './runtime-irc-service.js';
import { RuntimeNetworkSessionService } from './runtime-network-session-service.js';
import { RuntimePublisher } from './runtime-publisher.js';
import { createRuntimeSnapshot } from './runtime-snapshot.js';
import type {
  RuntimeConversationMutations,
  RuntimeFriendMutations,
  RuntimeGateway,
  RuntimeNetworkMutations,
  RuntimeServices,
  RuntimeStore,
} from './runtime-service-types.js';
import { RuntimeSocketHub } from './runtime-socket-hub.js';
import { createRuntimeWebSocketApi } from './runtime-websocket-api.js';

type MutationResult = {
  messages: readonly ServerMessage[];
};

const tagMutationMessages = (messages: readonly ServerMessage[]) => {
  if (messages.length === 0) {
    return messages;
  }
  const mutationId = randomUUID();
  return messages.map((message) => ({ ...message, mutationId }));
};

const assistantAutoStart = !process.env.NODE_TEST_CONTEXT;

export const createRuntimeServices = (store: RuntimeStore): RuntimeServices => {
  let closing = false;
  let connectionManager!: RuntimeConnectionManager;

  const socketHub = new RuntimeSocketHub((ws) => connectionManager.removeSocket(ws));
  const publisher = new RuntimePublisher(socketHub);
  const publishMutation = <T extends MutationResult>(result: T): T => {
    const messages = tagMutationMessages(result.messages);
    if (messages.length > 0) {
      publisher.publish(messages);
    }
    return { ...result, messages } as T;
  };

  const conversationsService = new RuntimeConversationService({
    conversations: store.conversations,
    networks: store.networks,
  });
  const eventRouter = new RuntimeEventRouter({
    conversations: conversationsService,
    friends: store.friends,
    publish: (messages) => publisher.publish(messages),
    sendSocket: (ws, message) => publisher.sendSocket(ws, message),
  });
  connectionManager = new RuntimeConnectionManager({
    eventRouter,
    friends: store.friends,
    networks: store.networks,
    isClosing: () => closing,
  });

  const friendMutations = new RuntimeFriendService({
    connectionManager,
    friends: store.friends,
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
    networks: store.networks,
  });
  const assistant = new AssistantService({
    assistant: store.assistant,
    conversations: store.conversations,
    networks: store.networks,
    autoStart: assistantAutoStart,
    publish: (messages) => publisher.publish(messages),
  });
  const closeGateway = () => {
    closing = true;
    socketHub.closeAll();
    assistant.close();
    connectionManager.close();
  };
  const gateway: RuntimeGateway = {
    attachSocket: (ws) => socketHub.attach(ws),
    detachSocket: (ws) => socketHub.detach(ws),
    publish: (message) => publisher.publish(message),
    snapshot: () => createRuntimeSnapshot(store.snapshotSource, connectionManager, assistant.snapshot()),
    close: closeGateway,
  };
  const conversations: RuntimeConversationMutations = {
    openQuery: (networkId, target) => publishMutation(conversationsService.openQuery(networkId, target)),
    closeBuffer: (bufferId) => publishMutation(conversationsService.closeQueryBuffer(bufferId)),
    markBufferRead: (bufferId) => publishMutation(conversationsService.markBufferRead(bufferId)),
    history: (bufferId, limit) => conversationsService.listBufferHistory(bufferId, limit),
  };
  const friends: RuntimeFriendMutations = {
    upsertFriend: (nick) => publishMutation(friendMutations.upsertFriend(nick)),
    removeFriend: (friendId) => publishMutation(friendMutations.removeFriend(friendId)),
  };
  const networks: RuntimeNetworkMutations = {
    saveNetwork: (data, networkId) => publishMutation(networkMutations.saveNetwork(data, networkId)),
    duplicateNetwork: (networkId) => publishMutation(networkMutations.duplicateNetwork(networkId)),
    deleteNetwork: (networkId) => publishMutation(networkMutations.deleteNetwork(networkId)),
  };
  const http = createRuntimeHttpApi({
    assistant,
    catalog: store.networks,
    conversations,
    friends,
    irc,
    networks,
    sessions,
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
    irc,
    networks,
    assistant,
    http,
    ws,
  };
};
