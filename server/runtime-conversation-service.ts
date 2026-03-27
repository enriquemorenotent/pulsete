import { randomUUID } from 'node:crypto';
import type {
  BufferSelfNickAliasesRequest,
  BufferHistoryImportRequest,
  BufferState,
  ChatMessage,
  MessageKind,
  ServerMessage,
} from '../shared/protocol.js';
import { formatMessage, formatTimestamp } from './assistant-history-context.js';
import { mergeNickAliases } from './message-attribution.js';
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

type ImportBatchStore = RuntimeConversationStore & {
  createHistoryImportBatch?: (input: {
    networkId: string;
    bufferId: string;
    target: string;
    selfNickSnapshot: string[];
  }) => { id: string } | null;
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
    const persistentSelfNickAliases = buffer.kind === 'query'
      ? mergeNickAliases([
        ...(buffer.selfNickAliases ?? []),
        ...input.selfNicks,
      ], [
        network.nick,
        ...network.altNicks,
      ])
      : (buffer.selfNickAliases ?? []);
    const importSelfNickAliases = buffer.kind === 'query'
      ? persistentSelfNickAliases
      : mergeNickAliases(input.selfNicks, [
      network.nick,
      ...network.altNicks,
    ]);
    const updatedBuffer = buffer.kind !== 'query' || haveSameNickAliases(buffer.selfNickAliases ?? [], persistentSelfNickAliases)
      ? buffer
      : this.options.conversations.upsertBuffer({
        ...buffer,
        unread: buffer.unread,
        selfNickAliases: persistentSelfNickAliases,
      });
    const selfNickSnapshot = mergeNickAliases([
      network.nick,
      ...network.altNicks,
      ...importSelfNickAliases,
    ]);
    const importBatchId = (this.options.conversations as ImportBatchStore)
      .createHistoryImportBatch?.({
        networkId: buffer.networkId,
        bufferId: buffer.id,
        target: buffer.target,
        selfNickSnapshot,
      })?.id ?? null;
    const result = importLogFiles({
      buffer: updatedBuffer,
      existingMessages,
      files: input.files,
      selfNicks: selfNickSnapshot,
      importBatchId,
    });
    const messages: ServerMessage[] = [];
    if (updatedBuffer !== buffer) {
      messages.push({ type: 'buffer.upsert', buffer: updatedBuffer });
    }
    messages.push(...result.messages.map((message) => ({
      type: 'message.append' as const,
      message: this.options.conversations.appendMessage(message),
    })));
    return {
      summary: result.summary,
      messages,
    };
  }

  updateBufferSelfNickAliases(bufferId: string, input: BufferSelfNickAliasesRequest) {
    const buffer = this.options.conversations.getBuffer(bufferId);
    if (!buffer) {
      throw notFound('Buffer not found');
    }
    if (buffer.kind !== 'channel' && buffer.kind !== 'query') {
      throw badRequest('Only channels and private messages can repair self aliases');
    }
    const network = requireStoredNetwork(this.options.networks, buffer.networkId);
    const selfNickAliases = mergeNickAliases(input.selfNickAliases, [
      network.nick,
      ...network.altNicks,
    ]);
    const updatedBuffer = (haveSameNickAliases(buffer.selfNickAliases ?? [], selfNickAliases)
      ? buffer
      : this.options.conversations.upsertBuffer({
        ...buffer,
        unread: buffer.unread,
        selfNickAliases,
      })) as BufferState & { kind: 'channel' | 'query' };
    const repairedMessages = this.options.conversations.repairBufferMessageAttributions({
      bufferKind: updatedBuffer.kind,
      networkId: updatedBuffer.networkId,
      target: updatedBuffer.target,
      nick: network.nick,
      altNicks: network.altNicks,
      selfNickAliases,
    });
    const messages: ServerMessage[] = [];
    if (updatedBuffer !== buffer) {
      messages.push({ type: 'buffer.upsert', buffer: updatedBuffer });
    }
    messages.push(...repairedMessages.map((message) => ({
      type: 'message.upsert' as const,
      message,
    })));
    return {
      buffer: updatedBuffer,
      repairedCount: repairedMessages.length,
      messages,
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
    const openTargetNotice =
      event.message.kind === 'notice'
      && event.message.target !== 'server'
      && !isChannelTarget(event.message.target)
      && !this.options.conversations.getBufferByTarget(event.message.networkId, event.message.target);
    const message = openTargetNotice
      ? {
          ...event.message,
          target: 'server',
        }
      : event.message;
    const removedChannel = event.message.self && event.message.kind === 'part'
      ? this.options.conversations.getChannelByName(event.message.networkId, event.message.target)
      : null;
    if (event.message.self && event.message.kind === 'part' && !removedChannel) {
      return [];
    }

    const { saved, bufferUpdate } = appendConversationMessage(this.options.conversations, {
      message,
      currentNick: event.currentNick,
      altNicks: event.altNicks,
    });
    const messages: ServerMessage[] = [{ type: 'message.append', message: saved }];
    if (bufferUpdate) {
      messages.push({ type: 'buffer.upsert', buffer: bufferUpdate });
    }

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

  handlePeerQuitEvent(event: Extract<RuntimeEvent, { type: 'peer-quit' }>) {
    if (event.self) {
      return [];
    }
    const queryBuffer = this.options.conversations.getBufferByTarget(event.networkId, event.nick);
    if (queryBuffer?.kind !== 'query') {
      return [];
    }
    return this.appendMessage({
      id: randomUUID(),
      networkId: event.networkId,
      target: queryBuffer.target,
      nick: event.nick,
      body: `${event.nick} quit (${event.reason})`,
      kind: 'quit' satisfies MessageKind,
      self: false,
      ts: Date.now(),
    });
  }

  handleChannelEvent(event: Extract<RuntimeEvent, { type: 'channel' }>) {
    const { buffer, channel } = upsertConversationChannel(this.options.conversations, event);
    return [
      { type: 'buffer.upsert', buffer },
      { type: 'channel.snapshot', channel },
    ] satisfies ServerMessage[];
  }

  private appendMessage(message: MessageInput) {
    const { saved, bufferUpdate } = appendConversationMessage(this.options.conversations, { message });
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

const haveSameNickAliases = (left: string[], right: string[]) =>
  left.length === right.length
  && left.every((entry, index) => entry === right[index]);

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
