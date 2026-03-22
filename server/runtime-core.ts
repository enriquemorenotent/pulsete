import type WebSocket from 'ws';
import type { ServerMessage } from '../shared/protocol.js';
import { NetworkLifecycleService } from './network-lifecycle-service.js';
import { RuntimeConnectionManager } from './runtime-connection-manager.js';
import { RuntimeConversationService } from './runtime-conversation-service.js';
import { RuntimeEventRouter } from './runtime-event-router.js';
import { RuntimeFriendService } from './runtime-friend-service.js';
import { RuntimeIrcService } from './runtime-irc-service.js';
import { RuntimeNetworkSessionService } from './runtime-network-session-service.js';
import { RuntimePublisher } from './runtime-publisher.js';
import { createRuntimeSnapshot } from './runtime-snapshot.js';
import { RuntimeSocketHub } from './runtime-socket-hub.js';
import type { StorageConversationsRepository } from './storage-conversations-repository.js';
import type { StorageFriendsRepository } from './storage-friends-repository.js';
import type { StorageNetworksRepository } from './storage-networks-repository.js';
import type { StorageSnapshotSource } from './storage-types.js';

type MutationResult = {
  messages: readonly ServerMessage[];
};

export type RuntimeStore = {
  snapshotSource: StorageSnapshotSource;
  conversations: StorageConversationsRepository;
  friends: StorageFriendsRepository;
  networks: StorageNetworksRepository;
};

export type RuntimeGateway = {
  attachSocket(ws: WebSocket): void;
  detachSocket(ws: WebSocket): void;
  publish(message: ServerMessage | readonly ServerMessage[]): void;
  snapshot(): ReturnType<typeof createRuntimeSnapshot>;
  close(): void;
};

export type RuntimeConversationMutations = {
  openQuery: RuntimeConversationService['openQuery'];
  closeBuffer(bufferId: string): ReturnType<RuntimeConversationService['closeQueryBuffer']>;
  markBufferRead: RuntimeConversationService['markBufferRead'];
  history: RuntimeConversationService['listBufferHistory'];
};

export type RuntimeFriendMutations = {
  upsertFriend: RuntimeFriendService['upsertFriend'];
  removeFriend: RuntimeFriendService['removeFriend'];
};

export type RuntimeNetworkMutations = {
  saveNetwork: NetworkLifecycleService['saveNetwork'];
  duplicateNetwork: NetworkLifecycleService['duplicateNetwork'];
  deleteNetwork: NetworkLifecycleService['deleteNetwork'];
};

export type RuntimeNetworkCatalog = Pick<StorageNetworksRepository, 'list'>;

export type RuntimeContext = {
  networkCatalog: RuntimeNetworkCatalog;
  gateway: Pick<RuntimeGateway, 'attachSocket' | 'detachSocket' | 'snapshot'>;
  sessions: RuntimeNetworkSessionService;
  conversations: RuntimeConversationMutations;
  friends: RuntimeFriendMutations;
  irc: Pick<RuntimeIrcService, 'join' | 'part' | 'sendMessage' | 'sendRaw'>;
  networks: RuntimeNetworkMutations;
};

export type RuntimeServices = {
  connections: RuntimeConnectionManager['connections'];
  gateway: RuntimeGateway;
  sessions: RuntimeNetworkSessionService;
  conversations: RuntimeConversationMutations;
  friends: RuntimeFriendMutations;
  irc: Pick<RuntimeIrcService, 'join' | 'part' | 'sendMessage' | 'sendRaw'>;
  networks: RuntimeNetworkMutations;
  context: RuntimeContext;
};

export const createRuntimeServices = (store: RuntimeStore): RuntimeServices => {
  let closing = false;
  let connectionManager!: RuntimeConnectionManager;

  const socketHub = new RuntimeSocketHub((ws) => connectionManager.removeSocket(ws));
  const publisher = new RuntimePublisher(socketHub);
  const publishMutation = <T extends MutationResult>(result: T): T => {
    if (result.messages.length > 0) {
      publisher.publish(result.messages);
    }
    return result;
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
  const closeGateway = () => {
    closing = true;
    socketHub.closeAll();
    connectionManager.close();
  };
  const gateway: RuntimeGateway = {
    attachSocket: (ws) => socketHub.attach(ws),
    detachSocket: (ws) => socketHub.detach(ws),
    publish: (message) => publisher.publish(message),
    snapshot: () => createRuntimeSnapshot(store.snapshotSource, connectionManager),
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

  return {
    connections: connectionManager.connections,
    gateway,
    sessions,
    conversations,
    friends,
    irc,
    networks,
    context: {
      networkCatalog: store.networks,
      gateway,
      sessions,
      conversations,
      friends,
      irc,
      networks,
    },
  };
};
