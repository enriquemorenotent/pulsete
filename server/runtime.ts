import WebSocket from 'ws';
import type { ServerMessage } from '../shared/protocol.js';
import { RuntimeConnectionManager } from './runtime-connection-manager.js';
import { NetworkLifecycleService } from './network-lifecycle-service.js';
import { RuntimeConversationService } from './runtime-conversation-service.js';
import { RuntimeEventRouter } from './runtime-event-router.js';
import { notFound } from './app-error.js';
import { RuntimeFriendService } from './runtime-friend-service.js';
import { RuntimeIrcService } from './runtime-irc-service.js';
import { RuntimePublisher } from './runtime-publisher.js';
import { RuntimeSocketHub } from './runtime-socket-hub.js';
import { createRuntimeSnapshot } from './runtime-snapshot.js';
import { Storage } from './storage.js';

export class Runtime {
  readonly store: Storage;
  readonly connections: RuntimeConnectionManager['connections'];
  private readonly socketHub: RuntimeSocketHub;
  private readonly publisher: RuntimePublisher;
  private readonly connectionManager: RuntimeConnectionManager;
  private readonly conversations: RuntimeConversationService;
  private readonly friends: RuntimeFriendService;
  private readonly irc: RuntimeIrcService;
  private readonly networks: NetworkLifecycleService;
  private closing = false;

  constructor(store: Storage) {
    this.store = store;
    this.socketHub = new RuntimeSocketHub((ws) => this.connectionManager.removeSocket(ws));
    this.publisher = new RuntimePublisher(this.socketHub);
    this.conversations = new RuntimeConversationService({
      conversations: store.conversations,
      networks: store.networks,
      publish: (messages) => this.publisher.publish(messages),
    });
    const eventRouter = new RuntimeEventRouter({
      conversations: this.conversations,
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
    this.friends = new RuntimeFriendService({
      connectionManager: this.connectionManager,
      friends: store.friends,
      publish: (messages) => this.publisher.publish(messages),
    });
    this.irc = new RuntimeIrcService({
      connectionManager: this.connectionManager,
      conversations: store.conversations,
      networks: store.networks,
    });
    this.networks = new NetworkLifecycleService({
      conversations: store.conversations,
      connectionManager: this.connectionManager,
      networks: store.networks,
      publish: (messages) => this.publisher.publish(messages),
    });
    this.connections = this.connectionManager.connections;
  }

  attachSocket(ws: WebSocket) {
    this.socketHub.attach(ws);
  }

  detachSocket(ws: WebSocket) {
    this.socketHub.detach(ws);
  }

  publish(message: ServerMessage | readonly ServerMessage[]) {
    this.publisher.publish(message);
  }

  send(message: ServerMessage) {
    this.publish(message);
  }

  close() {
    this.closing = true;
    this.socketHub.closeAll();
    this.connectionManager.close();
  }

  snapshot() {
    return createRuntimeSnapshot(this.store, this.connectionManager);
  }

  connect(networkId: string) {
    if (!this.store.networks.get(networkId)) {
      throw notFound('Network not found');
    }
    this.connectionManager.connect(networkId);
  }

  disconnect(networkId: string) {
    if (!this.store.networks.get(networkId)) {
      throw notFound('Network not found');
    }
    this.connectionManager.disconnect(networkId);
  }

  join(networkId: string, channel: string, sourceBufferId?: string) {
    return this.irc.join(networkId, channel, sourceBufferId);
  }

  part(networkId: string, channel: string, sourceBufferId?: string) {
    return this.irc.part(networkId, channel, sourceBufferId);
  }

  openQuery(networkId: string, target: string) {
    return this.conversations.openQuery(networkId, target);
  }

  openQueryResult(networkId: string, target: string) {
    return this.conversations.openQueryResult(networkId, target);
  }

  duplicateNetwork(networkId: string) {
    return this.networks.duplicateNetwork(networkId);
  }

  duplicateNetworkResult(networkId: string) {
    return this.networks.duplicateNetworkResult(networkId);
  }

  upsertFriend(nick: string) {
    return this.friends.upsertFriend(nick);
  }

  upsertFriendResult(nick: string) {
    return this.friends.upsertFriendResult(nick);
  }

  removeFriend(friendId: string) {
    return this.friends.removeFriend(friendId);
  }

  removeFriendResult(friendId: string) {
    return this.friends.removeFriendResult(friendId);
  }

  closeBuffer(bufferId: string) {
    return this.conversations.closeQueryBuffer(bufferId);
  }

  closeBufferResult(bufferId: string) {
    return this.conversations.closeQueryBufferResult(bufferId);
  }

  markBufferRead(bufferId: string) {
    return this.conversations.markBufferRead(bufferId);
  }

  markBufferReadResult(bufferId: string) {
    return this.conversations.markBufferReadResult(bufferId);
  }

  history(bufferId: string, limit: number) {
    return this.conversations.listBufferHistory(bufferId, limit);
  }

  saveNetwork(data: unknown, networkId?: string) {
    return this.networks.saveNetwork(data, networkId);
  }

  saveNetworkResult(data: unknown, networkId?: string) {
    return this.networks.saveNetworkResult(data, networkId);
  }

  sendMessage(networkId: string, target: string, body: string, kind: 'message' | 'action' = 'message', sourceBufferId?: string) {
    return this.irc.sendMessage(networkId, target, body, kind, sourceBufferId);
  }

  sendRaw(networkId: string, raw: string, sourceBufferId?: string) {
    return this.irc.sendRaw(networkId, raw, sourceBufferId);
  }

  requestChannelList(networkId: string, requester?: WebSocket) {
    return this.irc.requestChannelList(networkId, requester);
  }

  cancelChannelList(networkId: string, requester: WebSocket) {
    this.connectionManager.cancelChannelList(networkId, requester);
  }

  deleteNetwork(networkId: string) {
    return this.networks.deleteNetwork(networkId);
  }

  deleteNetworkResult(networkId: string) {
    return this.networks.deleteNetworkResult(networkId);
  }
}
