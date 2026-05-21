import { badRequest, notFound } from './app-error.js';
import { buildHistoryDownloadName, renderBufferHistoryDownload } from './runtime-conversation-download.js';
import { requireStoredNetwork } from './runtime-network-guard.js';
import {
  clearConversationQueryHistory,
  closeConversationBuffer,
  listConversationBufferHistory,
  markConversationBufferRead,
  openConversationQuery,
  saveConversationBufferNotes,
  searchConversationBufferHistory,
} from './runtime-conversation-store.js';
import { normalizeQueryTarget } from './irc-validate.js';
import { assertNotSelfPrivateMessageTarget } from './runtime-self-target.js';
import { historySearchContextAfter, historySearchContextBefore } from '../shared/protocol-chat.js';
import type {
  BufferHistorySearchPayload,
  LogSourceKind,
  LogSourceListFilters,
  LogSourceListPayload,
  LogHistorySearchFilters,
  LogHistorySearchPayload,
} from '../shared/protocol-chat.js';
import type { ServerMessage } from '../shared/protocol-messages.js';
import type { NetworkUserIdentity } from '../shared/user-identity.js';
import { removedBufferMessages } from './runtime-conversation-server-messages.js';
import type { RuntimeConversationServiceOptions } from './runtime-conversation-service-shared.js';

export const openRuntimeConversationQuery = (
  options: RuntimeConversationServiceOptions,
  networkId: string,
  target: string,
  peerIdentity?: NetworkUserIdentity | null,
  currentNick?: string | null,
) => {
  const network = requireStoredNetwork(options.networks, networkId);
  const normalizedTarget = normalizeQueryTarget(target);
  assertNotSelfPrivateMessageTarget(normalizedTarget, network, currentNick);
  const result = openConversationQuery(
    options.conversations,
    networkId,
    normalizedTarget,
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

export const clearRuntimeConversationBufferHistory = (
  options: RuntimeConversationServiceOptions,
  bufferId: string,
) => {
  const { buffer, deletedMessages } = clearConversationQueryHistory(options.conversations, bufferId);
  const messages: ServerMessage[] = [
    ...(deletedMessages.length > 0
      ? [{
          type: 'message.remove',
          bufferId: buffer.id,
          networkId: buffer.networkId,
          target: buffer.target,
          messageIds: deletedMessages.map((message) => message.id),
        } satisfies ServerMessage]
      : []),
    { type: 'buffer.upsert', buffer },
  ];
  return { buffer, messages };
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

export const searchRuntimeConversationLogs = (
  options: RuntimeConversationServiceOptions,
  query: string,
  limit: number,
  filters: LogHistorySearchFilters = {},
): LogHistorySearchPayload => {
  const trimmedQuery = query.trim();
  const networkId = normalizeOptionalFilter(filters.networkId);
  const target = normalizeOptionalFilter(filters.target);
  if (networkId) {
    requireStoredNetwork(options.networks, networkId);
  }
  const page = options.conversations.searchMessages(trimmedQuery, limit, {
    ...(networkId ? { networkId } : {}),
    ...(target ? { target } : {}),
  });
  return {
    query: trimmedQuery,
    networkId: networkId ?? null,
    target: target ?? null,
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

export const listRuntimeConversationLogSources = (
  options: RuntimeConversationServiceOptions,
  filters: LogSourceListFilters = {},
  limit: number,
): LogSourceListPayload => {
  const networkId = normalizeOptionalFilter(filters.networkId);
  const q = normalizeOptionalFilter(filters.q);
  const kind = normalizeLogSourceKind(filters.kind);
  if (networkId) {
    requireStoredNetwork(options.networks, networkId);
  }
  return {
    kind: kind ?? null,
    networkId: networkId ?? null,
    q: q ?? null,
    sources: options.conversations.listLogSources({
      ...(kind ? { kind } : {}),
      ...(networkId ? { networkId } : {}),
      ...(q ? { q } : {}),
    }, limit),
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

const normalizeOptionalFilter = (value: string | null | undefined) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

const normalizeLogSourceKind = (
  value: LogSourceListFilters['kind'],
): LogSourceKind | undefined =>
  value === 'channel' || value === 'query' ? value : undefined;
