import type { BufferHistoryImportRequest, BufferSelfNickAliasesRequest } from '../shared/protocol.js';
import type { RuntimeEvent } from './irc-types.js';
import {
  closeRuntimeConversationBuffer,
  exportRuntimeConversationBufferHistory,
  listRuntimeConversationBufferHistory,
  markRuntimeConversationBufferRead,
  openRuntimeConversationQuery,
} from './runtime-conversation-buffer-actions.js';
import {
  handleRuntimeConversationChannelEvent,
  handleRuntimeConversationMessageEvent,
  handleRuntimeConversationPeerNickEvent,
  handleRuntimeConversationPeerQuitEvent,
  handleRuntimeConversationSendFailure,
  handleRuntimeConversationStatusEvent,
} from './runtime-conversation-event-actions.js';
import {
  importRuntimeConversationHistory,
  updateRuntimeConversationSelfNickAliases,
} from './runtime-conversation-history-actions.js';
import type { RuntimeConversationServiceOptions } from './runtime-conversation-service-shared.js';

export class RuntimeConversationService {
  constructor(private readonly options: RuntimeConversationServiceOptions) {}

  openQuery(networkId: string, target: string) {
    return openRuntimeConversationQuery(this.options, networkId, target);
  }

  closeQueryBuffer(bufferId: string) {
    return closeRuntimeConversationBuffer(this.options, bufferId);
  }

  markBufferRead(bufferId: string) {
    return markRuntimeConversationBufferRead(this.options, bufferId);
  }

  listBufferHistory(bufferId: string, limit: number, beforeMessageId?: string) {
    return listRuntimeConversationBufferHistory(this.options, bufferId, limit, beforeMessageId);
  }

  exportBufferHistory(bufferId: string) {
    return exportRuntimeConversationBufferHistory(this.options, bufferId);
  }

  importHistory(bufferId: string, input: BufferHistoryImportRequest) {
    return importRuntimeConversationHistory(this.options, bufferId, input);
  }

  updateBufferSelfNickAliases(bufferId: string, input: BufferSelfNickAliasesRequest) {
    return updateRuntimeConversationSelfNickAliases(this.options, bufferId, input);
  }

  handleStatusEvent(event: Extract<RuntimeEvent, { type: 'status' }>) {
    return handleRuntimeConversationStatusEvent(this.options, event);
  }

  handleSendFailure(event: Extract<RuntimeEvent, { type: 'send-failed' }>) {
    return handleRuntimeConversationSendFailure(this.options, event);
  }

  handleMessageEvent(event: Extract<RuntimeEvent, { type: 'message' }>) {
    return handleRuntimeConversationMessageEvent(this.options, event);
  }

  handlePeerNickEvent(event: Extract<RuntimeEvent, { type: 'peer-nick' }>) {
    return handleRuntimeConversationPeerNickEvent(this.options, event);
  }

  handlePeerQuitEvent(event: Extract<RuntimeEvent, { type: 'peer-quit' }>) {
    return handleRuntimeConversationPeerQuitEvent(this.options, event);
  }

  handleChannelEvent(event: Extract<RuntimeEvent, { type: 'channel' }>) {
    return handleRuntimeConversationChannelEvent(this.options, event);
  }
}
