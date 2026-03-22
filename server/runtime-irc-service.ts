import type WebSocket from 'ws';
import { notFound } from './app-error.js';
import {
  normalizeChannelTarget,
  normalizeMessageBody,
  normalizeMessageTarget,
  normalizeRawCommand,
} from './irc-validate.js';
import type { RuntimeConnectionManager } from './runtime-connection-manager.js';
import type { StorageConversationsRepository } from './storage-conversations-repository.js';
import type { StorageNetworksRepository } from './storage-networks-repository.js';
import { parseRawIrcClientCommand } from '../shared/irc-client-command.js';

type RuntimeIrcServiceOptions = {
  connectionManager: RuntimeConnectionManager;
  conversations: StorageConversationsRepository;
  networks: StorageNetworksRepository;
};

export class RuntimeIrcService {
  constructor(private readonly options: RuntimeIrcServiceOptions) {}

  join(networkId: string, channel: string, sourceBufferId?: string) {
    this.requireNetwork(networkId);
    const normalizedChannel = normalizeChannelTarget(channel);
    const existingBuffer = this.options.conversations.getBufferByTarget(networkId, normalizedChannel);
    const existingChannel = this.options.conversations.getChannelByName(networkId, normalizedChannel);
    this.options.connectionManager.getConnection(networkId).join(
      normalizedChannel,
      this.resolveReplyTarget(networkId, sourceBufferId),
      { visiblePending: !(existingBuffer?.kind === 'channel' || existingChannel) }
    );
  }

  part(networkId: string, channel: string, sourceBufferId?: string) {
    this.requireNetwork(networkId);
    const normalizedChannel = normalizeChannelTarget(channel);
    this.options.connectionManager.getConnection(networkId).part(
      normalizedChannel,
      'Leaving',
      this.resolveReplyTarget(networkId, sourceBufferId, normalizedChannel)
    );
  }

  sendMessage(
    networkId: string,
    target: string,
    body: string,
    kind: 'message' | 'action' = 'message',
    sourceBufferId?: string,
  ) {
    const normalizedTarget = normalizeMessageTarget(target);
    const normalizedBody = normalizeMessageBody(body);
    const connection = this.options.connectionManager.getConnection(networkId);
    const replyTarget = this.resolveReplyTarget(networkId, sourceBufferId, normalizedTarget);
    kind === 'action'
      ? connection.action(normalizedTarget, normalizedBody, replyTarget)
      : connection.say(normalizedTarget, normalizedBody, replyTarget);
  }

  sendRaw(networkId: string, raw: string, sourceBufferId?: string) {
    const normalizedRaw = normalizeRawCommand(raw);
    const connection = this.options.connectionManager.getConnection(networkId);
    const replyTarget = this.resolveReplyTarget(networkId, sourceBufferId);
    const parsed = parseRawIrcClientCommand(normalizedRaw);
    if (parsed?.name === 'nick') {
      const nextNick = parsed.args[0];
      if (nextNick) {
        connection.lifecycle.socket
          ? connection.setNick(nextNick, replyTarget)
          : connection.sendRaw(normalizedRaw, replyTarget);
        return;
      }
    }
    if (parsed?.name === 'quit') {
      connection.lifecycle.socket
        ? connection.disconnect(normalizedRaw.trim())
        : connection.sendRaw(normalizedRaw, replyTarget);
      return;
    }
    connection.sendClientRaw(normalizedRaw, replyTarget);
  }

  requestChannelList(networkId: string, requester?: WebSocket) {
    this.requireNetwork(networkId);
    return this.options.connectionManager.requestChannelList(networkId, requester);
  }

  private requireNetwork(networkId: string) {
    if (!this.options.networks.get(networkId)) {
      throw notFound('Network not found');
    }
  }

  private resolveReplyTarget(networkId: string, sourceBufferId?: string, fallbackTarget = 'server') {
    if (!sourceBufferId) {
      return fallbackTarget;
    }
    const buffer = this.options.conversations.getBuffer(sourceBufferId);
    return buffer?.networkId === networkId ? buffer.target : fallbackTarget;
  }
}
