import { badRequest, notFound } from './app-error.js';
import { buildHistoryDownloadName, renderBufferHistoryDownload } from './runtime-conversation-download.js';
import { requireStoredNetwork } from './runtime-network-guard.js';
import {
  closeConversationBuffer,
  listConversationBufferHistory,
  markConversationBufferRead,
  openConversationQuery,
  saveConversationBufferNotes,
  searchConversationBufferHistory,
} from './runtime-conversation-store.js';
import { normalizeQueryTarget } from './irc-validate.js';
import { historySearchContextAfter, historySearchContextBefore } from '../shared/protocol-chat.js';
import type { BufferHistorySearchPayload } from '../shared/protocol-chat.js';
import type { ServerMessage } from '../shared/protocol-messages.js';
import type { NetworkUserIdentity } from '../shared/user-identity.js';
import type { RuntimeConversationServiceOptions } from './runtime-conversation-service-shared.js';

export const openRuntimeConversationQuery = (
  options: RuntimeConversationServiceOptions,
  networkId: string,
  target: string,
  peerIdentity?: NetworkUserIdentity | null,
) => {
  requireStoredNetwork(options.networks, networkId);
  const result = openConversationQuery(
    options.conversations,
    networkId,
    normalizeQueryTarget(target),
    peerIdentity,
  );
  return {
    buffer: result.buffer,
    messages: [
      { type: 'buffer.upsert', buffer: result.buffer } satisfies ServerMessage,
      ...removedBufferMessages(networkId, result.removedBufferIds, result.buffer.id),
    ],
  };
};

export const closeRuntimeConversationBuffer = (options: RuntimeConversationServiceOptions, bufferId: string) => {
  const buffer = closeConversationBuffer(options.conversations, bufferId);
  return {
    buffer,
    messages: [{ type: 'buffer.remove', networkId: buffer.networkId, bufferId: buffer.id } satisfies ServerMessage],
  };
};

export const markRuntimeConversationBufferRead = (options: RuntimeConversationServiceOptions, bufferId: string) => {
  const buffer = markConversationBufferRead(options.conversations, bufferId);
  return { buffer, messages: [{ type: 'buffer.upsert', buffer } satisfies ServerMessage] };
};

export const saveRuntimeConversationBufferNotes = (
  options: RuntimeConversationServiceOptions,
  bufferId: string,
  notes: string,
) => {
  const buffer = saveConversationBufferNotes(options.conversations, bufferId, notes);
  return { buffer, messages: [{ type: 'buffer.upsert', buffer } satisfies ServerMessage] };
};

export const listRuntimeConversationBufferHistory = (
  options: RuntimeConversationServiceOptions,
  bufferId: string,
  limit: number,
  beforeMessageId?: string,
) => listConversationBufferHistory(options.conversations, bufferId, limit, beforeMessageId);

export const searchRuntimeConversationBufferHistory = (
  options: RuntimeConversationServiceOptions,
  bufferId: string,
  query: string,
  limit: number,
): BufferHistorySearchPayload => {
  const trimmedQuery = query.trim();
  const page = searchConversationBufferHistory(options.conversations, bufferId, trimmedQuery, limit);
  return {
    query: trimmedQuery,
    results: page.messages.map((message) => ({
      message,
      context: options.conversations.getMessageWindow(
        message.id,
        historySearchContextBefore,
        historySearchContextAfter,
      ),
    })),
    hasMore: page.hasMore,
  };
};

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

const removedBufferMessages = (
  networkId: string,
  removedBufferIds: readonly string[],
  replacementBufferId: string,
): ServerMessage[] => removedBufferIds.map((bufferId) => ({
  type: 'buffer.remove',
  networkId,
  bufferId,
  replacementBufferId,
}));
