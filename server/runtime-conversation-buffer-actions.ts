import { badRequest, notFound } from './app-error.js';
import { buildHistoryDownloadName, renderBufferHistoryDownload } from './runtime-conversation-download.js';
import { requireStoredNetwork } from './runtime-network-guard.js';
import {
  clearConversationBufferHistory,
  closeConversationQueryBuffer,
  listConversationBufferHistory,
  markConversationBufferRead,
  openConversationQuery,
} from './runtime-conversation-store.js';
import { normalizeQueryTarget } from './irc-validate.js';
import type { ServerMessage } from '../shared/protocol.js';
import type { RuntimeConversationServiceOptions } from './runtime-conversation-service-shared.js';

export const openRuntimeConversationQuery = (
  options: RuntimeConversationServiceOptions,
  networkId: string,
  target: string,
) => {
  requireStoredNetwork(options.networks, networkId);
  const buffer = openConversationQuery(options.conversations, networkId, normalizeQueryTarget(target));
  return { buffer, messages: [{ type: 'buffer.upsert', buffer } satisfies ServerMessage] };
};

export const closeRuntimeConversationBuffer = (options: RuntimeConversationServiceOptions, bufferId: string) => {
  const buffer = closeConversationQueryBuffer(options.conversations, bufferId);
  return {
    buffer,
    messages: [{ type: 'buffer.remove', networkId: buffer.networkId, bufferId: buffer.id } satisfies ServerMessage],
  };
};

export const markRuntimeConversationBufferRead = (options: RuntimeConversationServiceOptions, bufferId: string) => {
  const buffer = markConversationBufferRead(options.conversations, bufferId);
  return { buffer, messages: [{ type: 'buffer.upsert', buffer } satisfies ServerMessage] };
};

export const listRuntimeConversationBufferHistory = (
  options: RuntimeConversationServiceOptions,
  bufferId: string,
  limit: number,
  beforeMessageId?: string,
) => listConversationBufferHistory(options.conversations, bufferId, limit, beforeMessageId);

export const exportRuntimeConversationBufferHistory = (
  options: RuntimeConversationServiceOptions,
  bufferId: string,
) => {
  const buffer = options.conversations.getBuffer(bufferId);
  if (!buffer) {
    throw notFound('Buffer not found');
  }
  if (buffer.kind === 'server') {
    throw badRequest('Only channels and private messages can export history');
  }
  const network = requireStoredNetwork(options.networks, buffer.networkId);
  const messages = options.conversations.listAllMessages(buffer.networkId, buffer.target);
  return {
    buffer,
    fileName: buildHistoryDownloadName(network.name, buffer.target),
    content: renderBufferHistoryDownload({ buffer, messages, networkName: network.name }),
  };
};

export const clearRuntimeConversationBufferHistory = (
  options: RuntimeConversationServiceOptions,
  bufferId: string,
) => {
  const { buffer, bufferUpdate, deletedMessages } = clearConversationBufferHistory(options.conversations, bufferId);
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
  return { buffer: bufferUpdate ?? buffer, messages };
};
