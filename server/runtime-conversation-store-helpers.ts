import { notFound } from './app-error.js';
import type { RuntimeConversationStore } from './runtime-store-ports.js';

export const getRequiredBuffer = (store: RuntimeConversationStore, bufferId: string) => {
  const buffer = store.getBuffer(bufferId);
  if (!buffer) {
    throw notFound('Buffer not found');
  }
  return buffer;
};
