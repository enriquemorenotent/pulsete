import WebSocket from 'ws';
import type { ServerMessage } from '../shared/protocol.js';
import type { IrcConnection } from './irc.js';
import { RuntimeConnectionManager } from './runtime-connection-manager.js';
import { RuntimeConversations } from './runtime-conversations.js';
import { handleRuntimeEvent } from './runtime-events.js';
import { getRequiredNetwork } from './runtime-operation-utils.js';
import { RuntimeOperations } from './runtime-operations.js';
import { RuntimeSocketHub } from './runtime-socket-hub.js';
import { Storage } from './storage.js';

export class Runtime {
  readonly store: Storage;
  readonly connections: Map<string, IrcConnection>;
  private readonly socketHub: RuntimeSocketHub;
  private readonly conversations: RuntimeConversations;
  private readonly connectionManager: RuntimeConnectionManager;
  private readonly operations: RuntimeOperations;
  private closing = false;

  constructor(store: Storage) {
    this.store = store;
    this.socketHub = new RuntimeSocketHub((ws) => this.connectionManager.removeSocket(ws));
    this.conversations = new RuntimeConversations({
      store,
      send: (message) => this.send(message),
    });
    this.connectionManager = new RuntimeConnectionManager({
      store,
      send: (message) => this.send(message),
      sendSocket: (ws, message) => this.socketHub.sendSocket(ws, message),
      onRuntimeEvent: (event) => handleRuntimeEvent({ store: this.store, send: (message) => this.send(message) }, event, this.conversations),
      isClosing: () => this.closing,
    });
    this.operations = new RuntimeOperations({
      store,
      connectionManager: this.connectionManager,
      conversations: this.conversations,
      send: (message) => this.send(message),
    });
    this.connections = this.connectionManager.connections;
  }

  attachSocket(ws: WebSocket) {
    this.socketHub.attach(ws);
  }

  detachSocket(ws: WebSocket) {
    this.socketHub.detach(ws);
  }

  send(message: ServerMessage) {
    this.socketHub.broadcast(message);
  }

  close() {
    this.closing = true;
    this.socketHub.closeAll();
    this.connectionManager.close();
  }

  snapshot() {
    const snapshot = this.store.snapshot();
    return {
      ...snapshot,
      ...this.connectionManager.snapshot(snapshot.networks, snapshot.friends),
    };
  }

  connect(networkId: string) {
    getRequiredNetwork(this.store, networkId);
    this.connectionManager.getConnection(networkId).connect();
  }

  disconnect(networkId: string) {
    getRequiredNetwork(this.store, networkId);
    this.connectionManager.disconnect(networkId);
  }

  join(networkId: string, channel: string, sourceBufferId?: string) {
    return this.operations.join(networkId, channel, sourceBufferId);
  }

  part(networkId: string, channel: string, sourceBufferId?: string) {
    return this.operations.part(networkId, channel, sourceBufferId);
  }

  openQuery(networkId: string, target: string) {
    return this.operations.openQuery(networkId, target);
  }

  duplicateNetwork(networkId: string) {
    return this.operations.duplicateNetwork(networkId);
  }

  upsertFriend(nick: string) {
    return this.operations.upsertFriend(nick);
  }

  removeFriend(friendId: string) {
    return this.operations.removeFriend(friendId);
  }

  closeBuffer(bufferId: string) {
    return this.operations.closeBuffer(bufferId);
  }

  markBufferRead(bufferId: string) {
    return this.operations.markBufferRead(bufferId);
  }

  history(bufferId: string, limit: number) {
    return this.operations.history(bufferId, limit);
  }

  saveNetwork(data: unknown, networkId?: string) {
    return this.operations.saveNetwork(data, networkId);
  }

  sendMessage(networkId: string, target: string, body: string, kind: 'message' | 'action' = 'message', sourceBufferId?: string) {
    return this.operations.sendMessage(networkId, target, body, kind, sourceBufferId);
  }

  sendRaw(networkId: string, raw: string, sourceBufferId?: string) {
    return this.operations.sendRaw(networkId, raw, sourceBufferId);
  }

  requestChannelList(networkId: string, requester?: WebSocket) {
    return this.operations.requestChannelList(networkId, requester);
  }

  cancelChannelList(networkId: string, requester: WebSocket) {
    this.connectionManager.cancelChannelList(networkId, requester);
  }

  deleteNetwork(networkId: string) {
    return this.operations.deleteNetwork(networkId);
  }
}
