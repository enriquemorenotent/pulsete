import type { BufferHistoryImportRequest, BufferSelfNickAliasesRequest, BufferState, ServerMessage } from '../shared/protocol.js';
import { badRequest, notFound } from './app-error.js';
import { importLogFiles } from './history-import.js';
import { mergeNickAliases } from './message-attribution.js';
import { requireStoredNetwork } from './runtime-network-guard.js';
import type { ImportBatchStore, RuntimeConversationServiceOptions } from './runtime-conversation-service-shared.js';
import { haveSameNickAliases } from './runtime-conversation-service-shared.js';

export const importRuntimeConversationHistory = (
  options: RuntimeConversationServiceOptions,
  bufferId: string,
  input: BufferHistoryImportRequest,
) => {
  const buffer = options.conversations.getBuffer(bufferId);
  if (!buffer) {
    throw notFound('Buffer not found');
  }
  if (buffer.kind === 'server') {
    throw badRequest('Only channels and private messages can import history');
  }
  const network = requireStoredNetwork(options.networks, buffer.networkId);
  const existingMessages = options.conversations.listAllMessages(buffer.networkId, buffer.target);
  const persistentSelfNickAliases = buffer.kind === 'query'
    ? mergeNickAliases([...(buffer.selfNickAliases ?? []), ...input.selfNicks], [network.nick, ...network.altNicks])
    : (buffer.selfNickAliases ?? []);
  const importSelfNickAliases = buffer.kind === 'query'
    ? persistentSelfNickAliases
    : mergeNickAliases(input.selfNicks, [network.nick, ...network.altNicks]);
  const updatedBuffer = buffer.kind !== 'query' || haveSameNickAliases(buffer.selfNickAliases ?? [], persistentSelfNickAliases)
    ? buffer
    : options.conversations.upsertBuffer({ ...buffer, unread: buffer.unread, selfNickAliases: persistentSelfNickAliases });
  const selfNickSnapshot = mergeNickAliases([network.nick, ...network.altNicks, ...importSelfNickAliases]);
  const importBatchId = (options.conversations as ImportBatchStore).createHistoryImportBatch?.({
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
    message: options.conversations.appendMessage(message),
  })));
  return { summary: result.summary, messages };
};

export const updateRuntimeConversationSelfNickAliases = (
  options: RuntimeConversationServiceOptions,
  bufferId: string,
  input: BufferSelfNickAliasesRequest,
) => {
  const buffer = options.conversations.getBuffer(bufferId);
  if (!buffer) {
    throw notFound('Buffer not found');
  }
  if (buffer.kind !== 'channel' && buffer.kind !== 'query') {
    throw badRequest('Only channels and private messages can repair self aliases');
  }
  const network = requireStoredNetwork(options.networks, buffer.networkId);
  const selfNickAliases = mergeNickAliases(input.selfNickAliases, [network.nick, ...network.altNicks]);
  const updatedBuffer = (haveSameNickAliases(buffer.selfNickAliases ?? [], selfNickAliases)
    ? buffer
    : options.conversations.upsertBuffer({
      ...buffer,
      unread: buffer.unread,
      selfNickAliases,
    })) as BufferState & { kind: 'channel' | 'query' };
  const repairedMessages = options.conversations.repairBufferMessageAttributions({
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
  messages.push(...repairedMessages.map((message) => ({ type: 'message.upsert' as const, message })));
  return { buffer: updatedBuffer, repairedCount: repairedMessages.length, messages };
};
