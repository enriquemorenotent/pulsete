import { normalizeIrcIdentifier } from '../../shared/irc-identifiers.js';
import { historyWindowLimit, type BufferState, type ChatMessage } from '../../shared/protocol.js';

export type ConversationMessages = Record<string, ChatMessage[]>;

export const liveConversationMessageLimit = historyWindowLimit * 4;

export const toConversationMessageKey = (networkId: string, target: string) =>
  `${networkId}:${normalizeIrcIdentifier(target)}`;

export const indexConversationMessages = (messages: ChatMessage[]): ConversationMessages => {
  const buckets: ConversationMessages = {};
  for (const [key, bucket] of groupMessagesByConversation(messages)) {
    buckets[key] = normalizeMessageBucket(bucket);
  }
  return buckets;
};

export const appendConversationMessages = (
  current: ConversationMessages,
  incoming: ChatMessage[],
  options: { maxMessagesPerConversation?: number } = {},
): ConversationMessages => {
  if (incoming.length === 0) {
    return current;
  }
  const next = { ...current };
  for (const [key, bucket] of groupMessagesByConversation(incoming)) {
    next[key] = limitMessageBucket(
      appendMessageBucket(next[key] ?? [], bucket),
      options.maxMessagesPerConversation,
    );
  }
  return next;
};

export const prependConversationMessages = (
  current: ConversationMessages,
  incoming: ChatMessage[],
): ConversationMessages => {
  if (incoming.length === 0) {
    return current;
  }
  const next = { ...current };
  for (const [key, bucket] of groupMessagesByConversation(incoming)) {
    next[key] = prependMessageBucket(next[key] ?? [], bucket);
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

export const removeConversationMessages = (
  messages: ConversationMessages,
  networkId: string,
  target: string,
  messageIds: string[],
) => {
  if (messageIds.length === 0) {
    return messages;
  }
  const key = toConversationMessageKey(networkId, target);
  const bucket = messages[key];
  if (!bucket || bucket.length === 0) {
    return messages;
  }
  const deletedIds = new Set(messageIds);
  const nextBucket = bucket.filter((message) => !deletedIds.has(message.id));
  if (nextBucket.length === bucket.length) {
    return messages;
  }
  if (nextBucket.length === 0) {
    const next = { ...messages };
    delete next[key];
    return next;
  }
  return {
    ...messages,
    [key]: nextBucket,
  };
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

const groupMessagesByConversation = (messages: ChatMessage[]) => {
  const grouped = new Map<string, ChatMessage[]>();
  for (const message of messages) {
    const key = toConversationMessageKey(message.networkId, message.target);
    const bucket = grouped.get(key);
    if (bucket) {
      bucket.push(message);
      continue;
    }
    grouped.set(key, [message]);
  }
  return grouped;
};

const appendMessageBucket = (current: ChatMessage[], incoming: ChatMessage[]) => {
  const normalizedIncoming = normalizeMessageBucket(incoming);
  if (normalizedIncoming.length === 0) {
    return current;
  }
  if (current.length === 0) {
    return normalizedIncoming;
  }
  if (canAppendWithoutResort(current, normalizedIncoming)) {
    return [...current, ...normalizedIncoming];
  }
  return mergeMessageBucket(current, normalizedIncoming);
};

const prependMessageBucket = (current: ChatMessage[], incoming: ChatMessage[]) => {
  const normalizedIncoming = normalizeMessageBucket(incoming);
  if (normalizedIncoming.length === 0) {
    return current;
  }
  if (current.length === 0) {
    return normalizedIncoming;
  }
  if (canPrependWithoutResort(current, normalizedIncoming)) {
    return [...normalizedIncoming, ...current];
  }
  return mergeMessageBucket(normalizedIncoming, current);
};

const normalizeMessageBucket = (messages: ChatMessage[]) => {
  if (messages.length < 2) {
    return messages;
  }
  const deduped = new Map<string, ChatMessage>();
  let sorted = true;
  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index];
    deduped.set(message.id, message);
    if (index > 0 && messages[index - 1].ts > message.ts) {
      sorted = false;
    }
  }
  const bucket = Array.from(deduped.values());
  return sorted && bucket.length === messages.length
    ? bucket
    : bucket.sort((left, right) => left.ts - right.ts);
};

const canAppendWithoutResort = (current: ChatMessage[], incoming: ChatMessage[]) => {
  if (current[current.length - 1]?.ts > incoming[0]?.ts) {
    return false;
  }
  return !hasDuplicateMessageIds(current, incoming);
};

const canPrependWithoutResort = (current: ChatMessage[], incoming: ChatMessage[]) => {
  if (incoming[incoming.length - 1]?.ts > current[0]?.ts) {
    return false;
  }
  return !hasDuplicateMessageIds(current, incoming);
};

const hasDuplicateMessageIds = (current: ChatMessage[], incoming: ChatMessage[]) => {
  const currentIds = new Set(current.map((message) => message.id));
  for (const message of incoming) {
    if (currentIds.has(message.id)) {
      return true;
    }
  }
  return false;
};

const limitMessageBucket = (bucket: ChatMessage[], maxMessages: number | undefined) =>
  typeof maxMessages === 'number' && maxMessages > 0 && bucket.length > maxMessages
    ? bucket.slice(-maxMessages)
    : bucket;
