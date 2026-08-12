import type { RuntimeEvent } from './irc-types.js';
import {
  clearRuntimeConversationBufferHistory,
  closeRuntimeConversationBuffer,
  exportRuntimeConversationBufferHistory,
  listRuntimeConversationBufferHistory,
  listRuntimeConversationLogSources,
  markRuntimeConversationBufferRead,
  openRuntimeConversationQuery,
  saveRuntimeConversationBufferNotes,
  searchRuntimeConversationBufferHistory,
  searchRuntimeConversationLogs,
} from './runtime-conversation-buffer-actions.js';
import {
  handleRuntimeConversationChannelEvent,
  handleRuntimeConversationMessageEvent,
  handleRuntimeConversationPeerNickEvent,
  handleRuntimeConversationPeerQuitEvent,
  handleRuntimeConversationSendFailure,
  handleRuntimeConversationStatusEvent,
} from './runtime-conversation-event-actions.js';
import type { RuntimeConversationServiceOptions } from './runtime-conversation-service-shared.js';
import {
  getRuntimePinnedMessageHistoryWindow,
  listRuntimePinnedMessages,
  setRuntimeMessagePinned,
} from './runtime-conversation-pin-actions.js';

export class RuntimeConversationService {
  constructor(private readonly options: RuntimeConversationServiceOptions) {}

  openQuery(
    networkId: string,
    target: string,
    peerIdentity?: Parameters<typeof openRuntimeConversationQuery>[3],
    currentNick?: Parameters<typeof openRuntimeConversationQuery>[4],
  ) {
    return openRuntimeConversationQuery(this.options, networkId, target, peerIdentity, currentNick);
  }

  closeBuffer(bufferId: string) {
    return closeRuntimeConversationBuffer(this.options, bufferId);
  }

  clearBufferHistory(bufferId: string) {
    return clearRuntimeConversationBufferHistory(this.options, bufferId);
  }

  markBufferRead(bufferId: string) {
    return markRuntimeConversationBufferRead(this.options, bufferId);
  }

  saveBufferNotes(bufferId: string, notes: string) {
    return saveRuntimeConversationBufferNotes(this.options, bufferId, notes);
  }

  listBufferHistory(bufferId: string, limit: number, beforeMessageId?: string) {
    return listRuntimeConversationBufferHistory(this.options, bufferId, limit, beforeMessageId);
  }

  searchBufferHistory(bufferId: string, query: string, limit: number) {
    return searchRuntimeConversationBufferHistory(this.options, bufferId, query, limit);
  }

  searchLogs(
    query: string,
    limit: number,
    filters?: Parameters<typeof searchRuntimeConversationLogs>[3],
  ) {
    return searchRuntimeConversationLogs(this.options, query, limit, filters);
  }

  listLogSources(
    filters: Parameters<typeof listRuntimeConversationLogSources>[1],
    limit: number,
  ) {
    return listRuntimeConversationLogSources(this.options, filters, limit);
  }

  exportBufferHistory(bufferId: string) {
    return exportRuntimeConversationBufferHistory(this.options, bufferId);
  }

  listPinnedMessages(bufferId: string) {
    return listRuntimePinnedMessages(this.options, bufferId);
  }

  setMessagePinned(bufferId: string, messageId: string, pinned: boolean) {
    return setRuntimeMessagePinned(this.options, bufferId, messageId, pinned);
  }

  getPinnedMessageHistoryWindow(bufferId: string, messageId: string) {
    return getRuntimePinnedMessageHistoryWindow(this.options, bufferId, messageId);
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
