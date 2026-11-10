import { randomUUID } from 'node:crypto';
import type { ServerMessage } from '../shared/protocol-messages.js';

export type MutationResult = {
  messages: readonly ServerMessage[];
};

export const tagMutationMessages = (messages: readonly ServerMessage[]) => {
  if (messages.length === 0) {
    return messages;
  }
  const mutationId = randomUUID();
  return messages.map((message) => ({ ...message, mutationId }));
};

export const createMutationPublisher =
  (publish: (messages: readonly ServerMessage[]) => readonly ServerMessage[] | void) =>
  <T extends MutationResult>(result: T): T => {
    let messages = tagMutationMessages(result.messages);
    if (messages.length > 0) {
      messages = publish(messages) ?? messages;
    }
    return { ...result, messages } as T;
  };
