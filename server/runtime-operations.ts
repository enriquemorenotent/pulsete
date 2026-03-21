import type WebSocket from 'ws';
import * as bufferOperations from './runtime-buffer-operations.js';
import * as friendOperations from './runtime-friend-operations.js';
import * as ircOperations from './runtime-irc-operations.js';
import * as networkOperations from './runtime-network-operations.js';
import type { RuntimeOperationContext } from './runtime-operation-types.js';

export class RuntimeOperations {
  private readonly context: RuntimeOperationContext;

  constructor(context: RuntimeOperationContext) {
    this.context = context;
  }

  openQuery(networkId: string, target: string) {
    return bufferOperations.openQuery(this.context, networkId, target);
  }

  duplicateNetwork(networkId: string) {
    return networkOperations.duplicateNetwork(this.context, networkId);
  }

  upsertFriend(nick: string) {
    return friendOperations.upsertFriend(this.context, nick);
  }

  removeFriend(friendId: string) {
    return friendOperations.removeFriend(this.context, friendId);
  }

  join(networkId: string, channel: string, sourceBufferId?: string) {
    return ircOperations.join(this.context, networkId, channel, sourceBufferId);
  }

  part(networkId: string, channel: string, sourceBufferId?: string) {
    return ircOperations.part(this.context, networkId, channel, sourceBufferId);
  }

  closeBuffer(bufferId: string) {
    return bufferOperations.closeBuffer(this.context, bufferId);
  }

  markBufferRead(bufferId: string) {
    return bufferOperations.markBufferRead(this.context, bufferId);
  }

  history(bufferId: string, limit: number) {
    return bufferOperations.history(this.context, bufferId, limit);
  }

  saveNetwork(data: unknown, networkId?: string) {
    return networkOperations.saveNetwork(this.context, data, networkId);
  }

  sendMessage(networkId: string, target: string, body: string, kind: 'message' | 'action' = 'message', sourceBufferId?: string) {
    return ircOperations.sendMessage(this.context, networkId, target, body, kind, sourceBufferId);
  }

  sendRaw(networkId: string, raw: string, sourceBufferId?: string) {
    return ircOperations.sendRaw(this.context, networkId, raw, sourceBufferId);
  }

  requestChannelList(networkId: string, requester?: WebSocket) {
    return ircOperations.requestChannelList(this.context, networkId, requester);
  }

  deleteNetwork(networkId: string) {
    return networkOperations.deleteNetwork(this.context, networkId);
  }
}
