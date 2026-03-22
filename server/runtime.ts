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
import { Storage } from './storage.js';

type MutationResult = {
  messages: readonly ServerMessage[];
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

export class Runtime {
  readonly store: Storage;
  readonly connections: RuntimeConnectionManager['connections'];
  readonly gateway: RuntimeGateway;
  readonly sessions: RuntimeNetworkSessionService;
  readonly conversations: RuntimeConversationMutations;
  readonly friends: RuntimeFriendMutations;
  readonly irc: Pick<RuntimeIrcService, 'join' | 'part' | 'sendMessage' | 'sendRaw'>;
  readonly networks: RuntimeNetworkMutations;
  readonly context: {
    storage: Storage;
    gateway: RuntimeGateway;
    sessions: RuntimeNetworkSessionService;
    conversations: RuntimeConversationMutations;
    friends: RuntimeFriendMutations;
    irc: Pick<RuntimeIrcService, 'join' | 'part' | 'sendMessage' | 'sendRaw'>;
    networks: RuntimeNetworkMutations;
  };

  private readonly socketHub: RuntimeSocketHub;
  private readonly publisher: RuntimePublisher;
  private readonly connectionManager: RuntimeConnectionManager;
  private closing = false;

  constructor(store: Storage) {
    this.store = store;
    this.socketHub = new RuntimeSocketHub((ws) => this.connectionManager.removeSocket(ws));
    this.publisher = new RuntimePublisher(this.socketHub);

    const conversations = new RuntimeConversationService({
      conversations: store.conversations,
      networks: store.networks,
    });
    const eventRouter = new RuntimeEventRouter({
      conversations,
      friends: store.friends,
      publish: (messages) => this.publisher.publish(messages),
      sendSocket: (ws, message) => this.publisher.sendSocket(ws, message),
    });
    this.connectionManager = new RuntimeConnectionManager({
      eventRouter,
      friends: store.friends,
      networks: store.networks,
      isClosing: () => this.closing,
    });

    const friendMutations = new RuntimeFriendService({
      connectionManager: this.connectionManager,
      friends: store.friends,
    });
    const irc = new RuntimeIrcService({
      connectionManager: this.connectionManager,
      conversations: store.conversations,
      networks: store.networks,
    });
    const networkMutations = new NetworkLifecycleService({
      conversations: store.conversations,
      connectionManager: this.connectionManager,
      networks: store.networks,
    });

    this.connections = this.connectionManager.connections;
    this.sessions = new RuntimeNetworkSessionService({
      connectionManager: this.connectionManager,
      networks: store.networks,
    });
    this.gateway = {
      attachSocket: (ws) => this.socketHub.attach(ws),
      detachSocket: (ws) => this.socketHub.detach(ws),
      publish: (message) => this.publisher.publish(message),
      snapshot: () => createRuntimeSnapshot(this.store, this.connectionManager),
      close: () => this.closeGateway(),
    };
    this.conversations = {
      openQuery: (networkId, target) => this.publishMutation(conversations.openQuery(networkId, target)),
      closeBuffer: (bufferId) => this.publishMutation(conversations.closeQueryBuffer(bufferId)),
      markBufferRead: (bufferId) => this.publishMutation(conversations.markBufferRead(bufferId)),
      history: (bufferId, limit) => conversations.listBufferHistory(bufferId, limit),
    };
    this.friends = {
      upsertFriend: (nick) => this.publishMutation(friendMutations.upsertFriend(nick)),
      removeFriend: (friendId) => this.publishMutation(friendMutations.removeFriend(friendId)),
    };
    this.irc = irc;
    this.networks = {
      saveNetwork: (data, networkId) => this.publishMutation(networkMutations.saveNetwork(data, networkId)),
      duplicateNetwork: (networkId) => this.publishMutation(networkMutations.duplicateNetwork(networkId)),
      deleteNetwork: (networkId) => this.publishMutation(networkMutations.deleteNetwork(networkId)),
    };
    this.context = {
      storage: this.store,
      gateway: this.gateway,
      sessions: this.sessions,
      conversations: this.conversations,
      friends: this.friends,
      irc: this.irc,
      networks: this.networks,
    };
  }

  private closeGateway() {
    this.closing = true;
    this.socketHub.closeAll();
    this.connectionManager.close();
  }

  private publishMutation<T extends MutationResult>(result: T): T {
    if (result.messages.length > 0) {
      this.publisher.publish(result.messages);
    }
    return result;
  }
}
