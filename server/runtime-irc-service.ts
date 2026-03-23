import type WebSocket from 'ws';
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

type RuntimeIrcConnection = ReturnType<RuntimeConnectionManager['getConnection']>;
type RuntimeIrcCompatConnection = RuntimeIrcConnection & {
  commands?: RuntimeIrcConnection['commands'];
  io?: RuntimeIrcConnection['io'];
  lifecycleControl?: RuntimeIrcConnection['lifecycleControl'];
};

export class RuntimeIrcService {
  constructor(private readonly options: RuntimeIrcServiceOptions) {}

  join(networkId: string, channel: string, sourceBufferId?: string) {
    requireStoredNetwork(this.options.networks, networkId);
    const normalizedChannel = normalizeChannelTarget(channel);
    const existingBuffer = this.options.conversations.getBufferByTarget(networkId, normalizedChannel);
    const existingChannel = this.options.conversations.getChannelByName(networkId, normalizedChannel);
    joinConnection(
      this.options.connectionManager.getConnection(networkId),
      normalizedChannel,
      this.resolveReplyTarget(networkId, sourceBufferId),
      { visiblePending: !(existingBuffer?.kind === 'channel' || existingChannel) }
    );
  }

  part(networkId: string, channel: string, sourceBufferId?: string) {
    requireStoredNetwork(this.options.networks, networkId);
    const normalizedChannel = normalizeChannelTarget(channel);
    partConnection(
      this.options.connectionManager.getConnection(networkId),
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
      ? actionConnection(connection, normalizedTarget, normalizedBody, replyTarget)
      : sayConnection(connection, normalizedTarget, normalizedBody, replyTarget);
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
          ? setNickConnection(connection, nextNick, replyTarget)
          : sendRawConnection(connection, normalizedRaw, replyTarget);
        return;
      }
    }
    if (parsed?.name === 'quit') {
      connection.lifecycle.socket
        ? disconnectConnection(connection, normalizedRaw.trim())
        : sendRawConnection(connection, normalizedRaw, replyTarget);
      return;
    }
    sendClientRawConnection(connection, normalizedRaw, replyTarget);
  }

  requestChannelList(networkId: string, requester?: WebSocket) {
    requireStoredNetwork(this.options.networks, networkId);
    return this.options.connectionManager.requestChannelList(networkId, requester);
  }

  private resolveReplyTarget(networkId: string, sourceBufferId?: string, fallbackTarget = 'server') {
    if (!sourceBufferId) {
      return fallbackTarget;
    }
    const buffer = this.options.conversations.getBuffer(sourceBufferId);
    return buffer?.networkId === networkId ? buffer.target : fallbackTarget;
  }
}

const joinConnection = (
  connection: RuntimeIrcConnection,
  channel: string,
  sourceTarget?: string,
  options?: { visiblePending?: boolean }
) => ((connection as RuntimeIrcCompatConnection).commands?.join ?? connection.join)(channel, sourceTarget, options);

const partConnection = (connection: RuntimeIrcConnection, channel: string, reason?: string, sourceTarget?: string) =>
  ((connection as RuntimeIrcCompatConnection).commands?.part ?? connection.part)(channel, reason, sourceTarget);

const sayConnection = (connection: RuntimeIrcConnection, target: string, text: string, sourceTarget?: string) =>
  ((connection as RuntimeIrcCompatConnection).commands?.say ?? connection.say)(target, text, sourceTarget);

const actionConnection = (connection: RuntimeIrcConnection, target: string, text: string, sourceTarget?: string) =>
  ((connection as RuntimeIrcCompatConnection).commands?.action ?? connection.action)(target, text, sourceTarget);

const setNickConnection = (connection: RuntimeIrcConnection, nick: string, sourceTarget?: string) =>
  ((connection as RuntimeIrcCompatConnection).lifecycleControl?.setNick ?? connection.setNick)(nick, sourceTarget);

const disconnectConnection = (connection: RuntimeIrcConnection, raw?: string) =>
  ((connection as RuntimeIrcCompatConnection).lifecycleControl?.disconnect ?? connection.disconnect)(raw);

const sendRawConnection = (connection: RuntimeIrcConnection, raw: string, sourceTarget?: string) =>
  ((connection as RuntimeIrcCompatConnection).io?.sendRaw ?? connection.sendRaw)(raw, sourceTarget);

const sendClientRawConnection = (connection: RuntimeIrcConnection, raw: string, sourceTarget?: string) =>
  ((connection as RuntimeIrcCompatConnection).io?.sendClientRaw ?? connection.sendClientRaw)(raw, sourceTarget);
