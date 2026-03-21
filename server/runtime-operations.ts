import type WebSocket from 'ws';
import type { ServerMessage } from '../shared/protocol.js';
import * as bufferOperations from './runtime-buffer-operations.js';
import * as friendOperations from './runtime-friend-operations.js';
import * as ircOperations from './runtime-irc-operations.js';
import * as networkOperations from './runtime-network-operations.js';
import type { RuntimeCommandResult, RuntimeOperationContext } from './runtime-operation-types.js';

export class RuntimeOperations {
  constructor(
    private readonly context: RuntimeOperationContext,
    private readonly publish: (messages: readonly ServerMessage[]) => void
  ) {}

  openQuery(networkId: string, target: string) {
    return this.commit(bufferOperations.openQuery(this.context, networkId, target));
  }

  duplicateNetwork(networkId: string) {
    return this.commit(networkOperations.duplicateNetwork(this.context, networkId));
  }

  upsertFriend(nick: string) {
    return this.commit(friendOperations.upsertFriend(this.context, nick));
  }

  removeFriend(friendId: string) {
    return this.commit(friendOperations.removeFriend(this.context, friendId));
  }

  join(networkId: string, channel: string, sourceBufferId?: string) {
    return this.commit(ircOperations.join(this.context, networkId, channel, sourceBufferId));
  }

  part(networkId: string, channel: string, sourceBufferId?: string) {
    return this.commit(ircOperations.part(this.context, networkId, channel, sourceBufferId));
  }

  closeBuffer(bufferId: string) {
    return this.commit(bufferOperations.closeBuffer(this.context, bufferId));
  }

  markBufferRead(bufferId: string) {
    return this.commit(bufferOperations.markBufferRead(this.context, bufferId));
  }

  history(bufferId: string, limit: number) {
    return this.commit(bufferOperations.history(this.context, bufferId, limit));
  }

  saveNetwork(data: unknown, networkId?: string) {
    return this.commit(networkOperations.saveNetwork(this.context, data, networkId));
  }

  sendMessage(networkId: string, target: string, body: string, kind: 'message' | 'action' = 'message', sourceBufferId?: string) {
    return this.commit(ircOperations.sendMessage(this.context, networkId, target, body, kind, sourceBufferId));
  }

  sendRaw(networkId: string, raw: string, sourceBufferId?: string) {
    return this.commit(ircOperations.sendRaw(this.context, networkId, raw, sourceBufferId));
  }

  requestChannelList(networkId: string, requester?: WebSocket) {
    return this.commit(ircOperations.requestChannelList(this.context, networkId, requester));
  }

  deleteNetwork(networkId: string) {
    return this.commit(networkOperations.deleteNetwork(this.context, networkId));
  }

  private commit<T>(result: RuntimeCommandResult<T>) {
    this.publish(result.messages);
    return result.value;
  }
}
