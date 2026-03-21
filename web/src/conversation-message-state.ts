import { normalizeIrcIdentifier } from '../../shared/irc-identifiers.js';
import type { BufferState, ChatMessage } from '../../shared/protocol.js';

export type ConversationMessages = Record<string, ChatMessage[]>;

export const toConversationMessageKey = (networkId: string, target: string) =>
  `${networkId}:${normalizeIrcIdentifier(target)}`;

export const indexConversationMessages = (messages: ChatMessage[]): ConversationMessages => {
  const buckets: ConversationMessages = {};
  for (const message of messages) {
    buckets[toConversationMessageKey(message.networkId, message.target)] = mergeMessageBucket(
      buckets[toConversationMessageKey(message.networkId, message.target)] ?? [],
      [message]
    );
  }
  return buckets;
};

export const appendConversationMessages = (
  current: ConversationMessages,
  incoming: ChatMessage[],
): ConversationMessages => {
  if (incoming.length === 0) {
    return current;
  }
  const next = { ...current };
  for (const message of incoming) {
    const key = toConversationMessageKey(message.networkId, message.target);
    next[key] = mergeMessageBucket(next[key] ?? [], [message]);
  }
  return next;
};

export const removeBufferMessages = (messages: ConversationMessages, buffer: BufferState) => {
  const key = toConversationMessageKey(buffer.networkId, buffer.target);
  if (!(key in messages)) {
    return messages;
  }
  const next = { ...messages };
  delete next[key];
  return next;
};

export const removeNetworkMessages = (messages: ConversationMessages, networkId: string) => {
  const next = Object.fromEntries(
    Object.entries(messages).filter(([key]) => !key.startsWith(`${networkId}:`))
  );
  return Object.keys(next).length === Object.keys(messages).length ? messages : next;
};

const mergeMessageBucket = (current: ChatMessage[], incoming: ChatMessage[]) => {
  const merged = new Map<string, ChatMessage>();
  for (const message of current) {
    merged.set(message.id, message);
  }
  for (const message of incoming) {
    merged.set(message.id, message);
  }
  return Array.from(merged.values()).sort((left, right) => left.ts - right.ts);
};
