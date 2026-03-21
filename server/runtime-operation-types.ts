import type { ServerMessage } from '../shared/protocol.js';
import type { RuntimeConnectionManager } from './runtime-connection-manager.js';
import type { Storage } from './storage.js';

export type RuntimeConversationOperations = {
  openQuery(networkId: string, target: string): RuntimeCommandResult<unknown>;
  closeQueryBuffer(bufferId: string): RuntimeCommandResult<unknown>;
  markBufferRead(bufferId: string): RuntimeCommandResult<unknown>;
  listBufferHistory(bufferId: string, limit: number): RuntimeCommandResult<unknown>;
};

export type RuntimeOperationContext = {
  store: Storage;
  connectionManager: RuntimeConnectionManager;
  conversations: RuntimeConversationOperations;
};

export type RuntimeCommandResult<T = void> = {
  value: T;
  messages: ServerMessage[];
};

export const createRuntimeCommandResult = <T>(value: T, messages: ServerMessage[] = []): RuntimeCommandResult<T> => ({
  value,
  messages,
});
