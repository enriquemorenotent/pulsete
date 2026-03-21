import type { ServerMessage } from '../shared/protocol.js';
import type { RuntimeConnectionManager } from './runtime-connection-manager.js';
import type { RuntimeConversations } from './runtime-conversations.js';
import type { Storage } from './storage.js';

export type RuntimeOperationContext = {
  store: Storage;
  connectionManager: RuntimeConnectionManager;
  conversations: RuntimeConversations;
  send(message: ServerMessage): void;
};

