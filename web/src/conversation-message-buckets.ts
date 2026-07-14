import type { ChatMessage } from '../../shared/protocol-chat.js';

export type MessageBucketMutationKind =
  | 'append'
  | 'upsert'
  | 'append-batch'
  | 'prepend-batch'
  | 'merge';

type MessageBucketStrategy = (
  current: ChatMessage[],
  incoming: ChatMessage[],
  maxMessages?: number,
) => ChatMessage[];

const messageIndexes = new WeakMap<ChatMessage[], ReadonlyMap<string, number>>();

const appendSingle: MessageBucketStrategy = (current, incoming, maxMessages) => {
  const message = incoming[0];
  if (!message) {
    return current;
  }
  const existingIndex = findMessageIndex(current, message.id);
  if (existingIndex >= 0) {
    return replaceExistingMessage(current, existingIndex, message, maxMessages);
  }
  return appendNewMessage(current, message, maxMessages);
};

const appendNewMessage = (
  current: ChatMessage[],
  message: ChatMessage,
  maxMessages?: number,
) => {
  if (current.length === 0 || current[current.length - 1]!.ts <= message.ts) {
    return joinWithinLimit(current, [message], maxMessages);
  }
  return insertSortedWithinLimit(current, message, maxMessages);
};

const upsertSingle: MessageBucketStrategy = (current, incoming, maxMessages) => {
  const message = incoming[0];
  if (!message) {
    return current;
  }
  const currentIndex = indexMessageBucket(current);
  const index = currentIndex.get(message.id);
  if (index === undefined) {
    return rememberMessageBucket(appendNewMessage(current, message, maxMessages));
  }
  return replaceExistingMessage(current, index, message, maxMessages, currentIndex);
};

const replaceExistingMessage = (
  current: ChatMessage[],
  index: number,
  message: ChatMessage,
  maxMessages?: number,
  currentIndex?: ReadonlyMap<string, number>,
) => {
  if (current[index] === message) {
    return trimNewest(current, maxMessages);
  }
  const previous = current[index - 1];
  const next = current[index + 1];
  if ((!previous || previous.ts <= message.ts) && (!next || message.ts <= next.ts)) {
    const updated = current.slice();
    updated[index] = message;
    const retained = trimNewest(updated, maxMessages);
    if (retained.length === current.length && currentIndex) {
      messageIndexes.set(retained, currentIndex);
      return retained;
    }
    return rememberMessageBucket(retained);
  }
  return rememberMessageBucket(mergeMessageBuckets(current, [message], maxMessages));
};

const appendBatch: MessageBucketStrategy = (current, incoming, maxMessages) => {
  const normalized = normalizeMessageBucket(incoming);
  if (normalized.length === 0) {
    return current;
  }
  if (
    current.length === 0
    || (
      current[current.length - 1]!.ts <= normalized[0]!.ts
      && !hasOverlappingIds(current, normalized)
    )
  ) {
    return joinWithinLimit(current, normalized, maxMessages);
  }
  return mergeMessageBuckets(current, normalized, maxMessages);
};

const prependBatch: MessageBucketStrategy = (current, incoming, maxMessages) => {
  const normalized = normalizeMessageBucket(incoming);
  if (normalized.length === 0) {
    return current;
  }
  if (
    current.length === 0
    || (
      normalized[normalized.length - 1]!.ts <= current[0]!.ts
      && !hasOverlappingIds(current, normalized)
    )
  ) {
    return joinWithinLimit(normalized, current, maxMessages);
  }
  return mergeMessageBuckets(normalized, current, maxMessages);
};

const mergeBuckets: MessageBucketStrategy = (current, incoming, maxMessages) =>
  mergeMessageBuckets(current, incoming, maxMessages);

const messageBucketStrategies: Record<MessageBucketMutationKind, MessageBucketStrategy> = {
  append: appendSingle,
  upsert: upsertSingle,
  'append-batch': appendBatch,
  'prepend-batch': prependBatch,
  merge: mergeBuckets,
};

export const applyMessageBucketMutation = (
  kind: MessageBucketMutationKind,
  current: ChatMessage[],
  incoming: ChatMessage[],
  maxMessages?: number,
) => messageBucketStrategies[kind](current, incoming, maxMessages);

export const normalizeMessageBucket = (messages: ChatMessage[]) => {
  if (messages.length < 2) {
    return messages;
  }
  const deduped = new Map<string, ChatMessage>();
  let sorted = true;
  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index]!;
    deduped.set(message.id, message);
    sorted &&= index === 0 || messages[index - 1]!.ts <= message.ts;
  }
  const bucket = Array.from(deduped.values());
  return sorted && bucket.length === messages.length
    ? bucket
    : bucket.sort(compareMessages);
};

const mergeMessageBuckets = (
  current: ChatMessage[],
  incoming: ChatMessage[],
  maxMessages?: number,
) => {
  const messagesById = new Map<string, ChatMessage>();
  for (const message of current) {
    messagesById.set(message.id, message);
  }
  for (const message of incoming) {
    messagesById.set(message.id, message);
  }
  return trimNewest(Array.from(messagesById.values()).sort(compareMessages), maxMessages);
};

const hasOverlappingIds = (current: ChatMessage[], incoming: ChatMessage[]) => {
  const incomingIds = new Set(incoming.map((message) => message.id));
  return current.some((message) => incomingIds.has(message.id));
};

const joinWithinLimit = (
  left: ChatMessage[],
  right: ChatMessage[],
  maxMessages?: number,
) => {
  const limit = positiveLimit(maxMessages);
  if (!limit || left.length + right.length <= limit) {
    return [...left, ...right];
  }
  if (right.length >= limit) {
    return right.slice(-limit);
  }
  const retained = left.slice(-(limit - right.length));
  retained.push(...right);
  return retained;
};

const insertSortedWithinLimit = (
  current: ChatMessage[],
  message: ChatMessage,
  maxMessages?: number,
) => {
  let insertionIndex = current.length;
  while (insertionIndex > 0 && current[insertionIndex - 1]!.ts > message.ts) {
    insertionIndex -= 1;
  }
  const total = current.length + 1;
  const retainedLength = Math.min(total, positiveLimit(maxMessages) ?? total);
  const retainedStart = total - retainedLength;
  if (insertionIndex < retainedStart) {
    return trimNewest(current, maxMessages);
  }
  const retained: ChatMessage[] = [];
  for (let position = retainedStart; position < total; position += 1) {
    if (position === insertionIndex) {
      retained.push(message);
    } else {
      retained.push(current[position < insertionIndex ? position : position - 1]!);
    }
  }
  return retained;
};

const trimNewest = (messages: ChatMessage[], maxMessages?: number) => {
  const limit = positiveLimit(maxMessages);
  return limit && messages.length > limit ? messages.slice(-limit) : messages;
};

const positiveLimit = (value: number | undefined) =>
  typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : undefined;

const indexMessageBucket = (messages: ChatMessage[]) => {
  const existing = messageIndexes.get(messages);
  if (existing) {
    return existing;
  }
  const index = new Map<string, number>();
  messages.forEach((message, position) => index.set(message.id, position));
  messageIndexes.set(messages, index);
  return index;
};

const findMessageIndex = (messages: ChatMessage[], messageId: string) => {
  const indexed = messageIndexes.get(messages);
  if (indexed) {
    return indexed.get(messageId) ?? -1;
  }
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]!.id === messageId) {
      return index;
    }
  }
  return -1;
};

const rememberMessageBucket = (messages: ChatMessage[]) => {
  indexMessageBucket(messages);
  return messages;
};

const compareMessages = (left: ChatMessage, right: ChatMessage) => left.ts - right.ts;
