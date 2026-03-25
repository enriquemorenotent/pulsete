import { randomUUID } from 'node:crypto';
import type {
  BufferHistoryImportRequest,
  BufferState,
  ChatMessage,
  MessageKind,
  ServerMessage,
} from '../shared/protocol.js';
import { formatMessage, formatTimestamp } from './assistant-history-context.js';
import { normalizeQueryTarget } from './irc-validate.js';
import { isServiceNick } from './irc-services.js';
import type { RuntimeEvent } from './irc-types.js';
import { requireStoredNetwork } from './runtime-network-guard.js';
import {
  appendConversationMessage,
  clearConversationBufferHistory,
  closeConversationQueryBuffer,
  listConversationBufferHistory,
  markConversationBufferRead,
  openConversationQuery,
  upsertConversationChannel,
} from './runtime-conversation-store.js';
import { importLogFiles } from './history-import.js';
import type { RuntimeConversationStore, RuntimeNetworkStore } from './runtime-store-ports.js';
import type { MessageInput } from './storage-types.js';
import { badRequest, notFound } from './app-error.js';

type RuntimeConversationServiceOptions = {
  conversations: RuntimeConversationStore;
  networks: Pick<RuntimeNetworkStore, 'get'>;
};

export class RuntimeConversationService {
  constructor(private readonly options: RuntimeConversationServiceOptions) {}

  openQuery(networkId: string, target: string) {
    requireStoredNetwork(this.options.networks, networkId);
    const buffer = openConversationQuery(this.options.conversations, networkId, normalizeQueryTarget(target));
    const messages = [{ type: 'buffer.upsert', buffer } satisfies ServerMessage];
    return { buffer, messages };
  }

  closeQueryBuffer(bufferId: string) {
    const removedBuffer = closeConversationQueryBuffer(this.options.conversations, bufferId);
    const messages = [{
      type: 'buffer.remove',
      networkId: removedBuffer.networkId,
      bufferId: removedBuffer.id,
    } satisfies ServerMessage];
    return { buffer: removedBuffer, messages };
  }

  markBufferRead(bufferId: string) {
    const updatedBuffer = markConversationBufferRead(this.options.conversations, bufferId);
    const messages = [{ type: 'buffer.upsert', buffer: updatedBuffer } satisfies ServerMessage];
    return { buffer: updatedBuffer, messages };
  }

  listBufferHistory(bufferId: string, limit: number, beforeMessageId?: string) {
    return listConversationBufferHistory(this.options.conversations, bufferId, limit, beforeMessageId);
  }

  exportBufferHistory(bufferId: string) {
    const buffer = this.options.conversations.getBuffer(bufferId);
    if (!buffer) {
      throw notFound('Buffer not found');
    }
    if (buffer.kind === 'server') {
      throw badRequest('Only channels and private messages can export history');
    }
    const network = requireStoredNetwork(this.options.networks, buffer.networkId);
    const messages = this.options.conversations.listAllMessages(buffer.networkId, buffer.target);
    return {
      buffer,
      fileName: buildHistoryDownloadName(network.name, buffer.target),
      content: renderBufferHistoryDownload({
        buffer,
        messages,
        networkName: network.name,
      }),
    };
  }

  clearBufferHistory(bufferId: string) {
    const { buffer, bufferUpdate, deletedMessages } = clearConversationBufferHistory(this.options.conversations, bufferId);
    const messages: ServerMessage[] = [];
    if (deletedMessages.length > 0) {
      messages.push({
        type: 'message.remove',
        networkId: buffer.networkId,
        target: buffer.target,
        messageIds: deletedMessages.map((message) => message.id),
      });
    }
    if (bufferUpdate) {
      messages.push({ type: 'buffer.upsert', buffer: bufferUpdate });
    }
    return {
      buffer: bufferUpdate ?? buffer,
      messages,
    };
  }

  importHistory(bufferId: string, input: BufferHistoryImportRequest) {
    const buffer = this.options.conversations.getBuffer(bufferId);
    if (!buffer) {
      throw notFound('Buffer not found');
    }
    if (buffer.kind === 'server') {
      throw badRequest('Only channels and private messages can import history');
    }
    const network = requireStoredNetwork(this.options.networks, buffer.networkId);
    const existingMessages = this.options.conversations.listAllMessages(buffer.networkId, buffer.target);
    const result = importLogFiles({
      buffer,
      existingMessages,
      files: input.files,
      selfNicks: [network.nick, ...network.altNicks, ...input.selfNicks],
    });
    return {
      summary: result.summary,
      messages: result.messages.map((message) => ({
        type: 'message.append' as const,
        message: this.options.conversations.appendMessage(message),
      })),
    };
  }

  handleStatusEvent(event: Extract<RuntimeEvent, { type: 'status' }>) {
    if (event.kind !== 'system') {
      return [{
        type: event.kind === 'error' ? 'error' : 'notice',
        networkId: event.networkId,
        message: event.message,
      } satisfies ServerMessage];
    }

    return this.appendMessage({
      id: randomUUID(),
      networkId: event.networkId,
      target: this.resolveStatusTarget(event),
      nick: null,
      body: event.message,
      kind: 'system' satisfies MessageKind,
      self: false,
      ts: Date.now(),
    });
  }

  handleSendFailure(event: Extract<RuntimeEvent, { type: 'send-failed' }>) {
    const messages: ServerMessage[] = [];
    if (event.rollbackMessageId) {
      const deletedMessages = this.options.conversations.deleteMessagesByIdPrefixes([event.rollbackMessageId]);
      if (deletedMessages.length > 0) {
        messages.push({
          type: 'message.remove',
          networkId: event.networkId,
          target: event.target,
          messageIds: deletedMessages.map((message) => message.id),
        });
      }
    }
    messages.push({
      type: 'error',
      networkId: event.networkId,
      message: event.message,
    });
    return messages;
  }

  handleMessageEvent(event: Extract<RuntimeEvent, { type: 'message' }>) {
    const removedChannel = event.message.self && event.message.kind === 'part'
      ? this.options.conversations.getChannelByName(event.message.networkId, event.message.target)
      : null;
    if (event.message.self && event.message.kind === 'part' && !removedChannel) {
      return [];
    }

    const messages = this.appendMessage(event.message);

    const closedServiceQuery = !event.message.self
      && event.message.target === 'server'
      && !!event.message.nick
      && isServiceNick(event.message.nick)
      ? this.options.conversations.getBufferByTarget(event.message.networkId, event.message.nick)
      : null;

    if (closedServiceQuery?.kind === 'query') {
      this.options.conversations.removeBuffer(closedServiceQuery.id);
      messages.push({
        type: 'buffer.remove',
        networkId: closedServiceQuery.networkId,
        bufferId: closedServiceQuery.id,
      });
    }

    if (removedChannel) {
      this.options.conversations.deleteChannelByName(event.message.networkId, event.message.target);
      messages.push({ type: 'buffer.remove', networkId: removedChannel.networkId, bufferId: removedChannel.id });
    }
    return messages;
  }

  handleChannelEvent(event: Extract<RuntimeEvent, { type: 'channel' }>) {
    const { buffer, channel } = upsertConversationChannel(this.options.conversations, event);
    return [
      { type: 'buffer.upsert', buffer },
      { type: 'channel.snapshot', channel },
    ] satisfies ServerMessage[];
  }

  private appendMessage(message: MessageInput) {
    const { saved, bufferUpdate } = appendConversationMessage(this.options.conversations, message);
    const messages: ServerMessage[] = [{ type: 'message.append', message: saved }];
    if (bufferUpdate) {
      messages.push({ type: 'buffer.upsert', buffer: bufferUpdate });
    }
    return messages;
  }

  private resolveStatusTarget(event: Extract<RuntimeEvent, { type: 'status' }>) {
    if (!event.target || event.target === 'server') {
      return 'server';
    }
    const boundTarget = this.options.conversations.getBufferByTarget(event.networkId, event.target)?.target;
    if (boundTarget) {
      return boundTarget;
    }
    if (isChannelTarget(event.target) || event.requireBoundTarget) {
      return 'server';
    }
    return event.target;
  }

}

const isChannelTarget = (value: string) => /^[#&+!]/.test(value);

const renderBufferHistoryDownload = ({
  buffer,
  messages,
  networkName,
}: {
  buffer: BufferState;
  messages: ChatMessage[];
  networkName: string;
}) => {
  const lines = [
    `Buffer: ${buffer.target}`,
    `Type: ${buffer.kind}`,
    `Network: ${networkName}`,
    `Exported at: ${formatTimestamp(Date.now())} UTC`,
    `Total messages: ${messages.length}`,
  ];
  if (messages.length > 0) {
    lines.push(
      `History range: ${formatTimestamp(messages[0]!.ts)} UTC to ${formatTimestamp(messages.at(-1)!.ts)} UTC`,
    );
  }
  lines.push('', messages.length > 0 ? messages.map(formatMessage).join('\n') : '(no messages available)');
  return `${lines.join('\n')}\n`;
};

const buildHistoryDownloadName = (networkName: string, target: string) => {
  const networkSlug = sanitizeFileNameSegment(networkName);
  const targetSlug = sanitizeFileNameSegment(target);
  return `history-${networkSlug}-${targetSlug}.txt`;
};

const sanitizeFileNameSegment = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'buffer';
