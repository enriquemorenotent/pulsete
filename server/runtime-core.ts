import type WebSocket from 'ws';
import type { ClientMessage, ServerMessage } from '../shared/protocol.js';
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

export type RuntimeHttpApi = {
  networks: {
    list: RuntimeNetworkCatalog['list'];
    save: RuntimeNetworkMutations['saveNetwork'];
    duplicate: RuntimeNetworkMutations['duplicateNetwork'];
    remove: RuntimeNetworkMutations['deleteNetwork'];
    connect(networkId: string): void;
    disconnect(networkId: string): void;
  };
  buffers: {
    joinChannel(networkId: string, channel: string, sourceBufferId?: string): void;
    openQuery: RuntimeConversationMutations['openQuery'];
    close: RuntimeConversationMutations['closeBuffer'];
    markRead: RuntimeConversationMutations['markBufferRead'];
    history: RuntimeConversationMutations['history'];
  };
  friends: {
    add: RuntimeFriendMutations['upsertFriend'];
    remove: RuntimeFriendMutations['removeFriend'];
  };
};

export type RuntimeWebSocketApi = {
  attachSocket(ws: WebSocket): void;
  detachSocket(ws: WebSocket): void;
  snapshot(): ReturnType<typeof createRuntimeSnapshot>;
  handleMessage(ws: WebSocket, message: ClientMessage): void;
};

export type RuntimeServices = {
  connections: RuntimeConnectionManager['connections'];
  gateway: RuntimeGateway;
  sessions: RuntimeNetworkSessionService;
  conversations: RuntimeConversationMutations;
  friends: RuntimeFriendMutations;
  irc: Pick<RuntimeIrcService, 'join' | 'part' | 'sendMessage' | 'sendRaw'>;
  networks: RuntimeNetworkMutations;
  http: RuntimeHttpApi;
  ws: RuntimeWebSocketApi;
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
  const http: RuntimeHttpApi = {
    networks: {
      list: () => store.networks.list(),
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
  };
  const ws: RuntimeWebSocketApi = {
    attachSocket: (ws) => gateway.attachSocket(ws),
    detachSocket: (ws) => gateway.detachSocket(ws),
    snapshot: () => gateway.snapshot(),
    handleMessage: (ws, message) => {
      switch (message.type) {
        case 'network.connect':
          http.networks.connect(message.networkId);
          return;
        case 'network.disconnect':
          http.networks.disconnect(message.networkId);
          return;
        case 'channel.join':
          http.buffers.joinChannel(message.networkId, message.channel, message.sourceBufferId);
          return;
        case 'channel.part':
          irc.part(message.networkId, message.channel, message.sourceBufferId);
          return;
        case 'query.open':
          http.buffers.openQuery(message.networkId, message.target);
          return;
        case 'message.send':
          irc.sendMessage(
            message.networkId,
            message.target,
            message.body,
            message.kind,
            message.sourceBufferId
          );
          return;
        case 'raw.send':
          irc.sendRaw(message.networkId, message.raw, message.sourceBufferId);
          return;
        case 'channel.list.request':
          sessions.requestChannelList(message.networkId, ws);
          return;
        case 'channel.list.cancel':
          sessions.cancelChannelList(message.networkId, ws);
          return;
      }
    },
  };

  return {
    connections: connectionManager.connections,
    gateway,
    sessions,
    conversations,
    friends,
    irc,
    networks,
    http,
    ws,
  };
};
