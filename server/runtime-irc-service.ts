import type { IrcRuntimeCommandConnection } from './irc-types.js';
import {
  normalizeChannelTarget,
  normalizeMessageBody,
  normalizeMessageTarget,
  normalizeRawCommand,
} from './irc-validate.js';
import type { RuntimeConnectionManager } from './runtime-connection-manager.js';
import { requireStoredNetwork } from './runtime-network-guard.js';
import type { RuntimeConversationStore, RuntimeNetworkStore } from './runtime-store-ports.js';
import { parseRawIrcClientCommand } from '../shared/irc-client-command.js';

type RuntimeIrcServiceOptions = {
  connectionManager: RuntimeConnectionManager;
  conversations: Pick<RuntimeConversationStore, 'getBuffer' | 'getBufferByTarget' | 'getChannelByName'>;
  networks: Pick<RuntimeNetworkStore, 'get'>;
};

type RuntimeIrcConnection = IrcRuntimeCommandConnection;

export class RuntimeIrcService {
  constructor(private readonly options: RuntimeIrcServiceOptions) {}

  join(networkId: string, channel: string, sourceBufferId?: string) {
    requireStoredNetwork(this.options.networks, networkId);
    const normalizedChannel = normalizeChannelTarget(channel);
    const existingBuffer = this.options.conversations.getBufferByTarget(networkId, normalizedChannel);
    const existingChannel = this.options.conversations.getChannelByName(networkId, normalizedChannel);
    const connection = this.options.connectionManager.getConnection(networkId);
    connection.commands.join(
      normalizedChannel,
      this.resolveReplyTarget(networkId, sourceBufferId),
      { visiblePending: !(existingBuffer?.kind === 'channel' || existingChannel) }
    );
  }

  part(networkId: string, channel: string, sourceBufferId?: string) {
    requireStoredNetwork(this.options.networks, networkId);
    const normalizedChannel = normalizeChannelTarget(channel);
    const connection = this.options.connectionManager.getConnection(networkId);
    connection.commands.part(
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
      ? connection.commands.action(normalizedTarget, normalizedBody, replyTarget)
      : connection.commands.say(normalizedTarget, normalizedBody, replyTarget);
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
          ? connection.lifecycleControl.setNick(nextNick, replyTarget)
          : connection.io.sendRaw(normalizedRaw, replyTarget);
        return;
      }
    }
    if (parsed?.name === 'quit') {
      connection.lifecycle.socket
        ? connection.lifecycleControl.disconnect(normalizedRaw.trim())
        : connection.io.sendRaw(normalizedRaw, replyTarget);
      return;
    }
    connection.io.sendClientRaw(normalizedRaw, replyTarget);
  }
  private resolveReplyTarget(networkId: string, sourceBufferId?: string, fallbackTarget = 'server') {
    if (!sourceBufferId) {
      return fallbackTarget;
    }
    const buffer = this.options.conversations.getBuffer(sourceBufferId);
    return buffer?.networkId === networkId ? buffer.target : fallbackTarget;
  }
}
