import {
  closeConversationQueryBuffer,
  listConversationBufferHistory,
  markConversationBufferRead,
  openConversationQuery,
} from './runtime-conversation-store.js';
import { createRuntimeCommandResult } from './runtime-operation-types.js';
import type { Storage } from './storage.js';

export class RuntimeConversationCommands {
  constructor(private readonly store: Storage) {}

  openQuery(networkId: string, target: string) {
    const buffer = openConversationQuery(this.store, networkId, target);
    return createRuntimeCommandResult(buffer, [{ type: 'buffer.upsert', buffer }]);
  }

  closeQueryBuffer(bufferId: string) {
    const removedBuffer = closeConversationQueryBuffer(this.store, bufferId);
    return createRuntimeCommandResult(removedBuffer, [
      { type: 'buffer.remove', networkId: removedBuffer.networkId, bufferId: removedBuffer.id },
    ]);
  }

  markBufferRead(bufferId: string) {
    const updatedBuffer = markConversationBufferRead(this.store, bufferId);
    return createRuntimeCommandResult(updatedBuffer, [{ type: 'buffer.upsert', buffer: updatedBuffer }]);
  }

  listBufferHistory(bufferId: string, limit: number) {
    return createRuntimeCommandResult(listConversationBufferHistory(this.store, bufferId, limit));
  }
}
