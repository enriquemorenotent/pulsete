import { normalizeIrcIdentifier } from '../../shared/irc-identifiers.js';
import { historyWindowLimit } from '../../shared/protocol-chat.js';
import type { BufferState, ChatMessage } from '../../shared/protocol-chat.js';

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

export const updateBufferMessageMetadata = (messages: ConversationMessages, buffer: BufferState) => {
  const key = buffer.id;
  const bucket = messages[key];
  if (!bucket || bucket.length === 0) {
    return messages;
  }
  let changed = false;
  const nextBucket = bucket.map((message) => {
    if (message.bufferId === buffer.id && message.networkId === buffer.networkId && message.target === buffer.target) {
      return message;
    }
    changed = true;
    return {
      ...message,
      bufferId: buffer.id,
      networkId: buffer.networkId,
      target: buffer.target,
    };
  });
  return changed ? { ...messages, [key]: nextBucket } : messages;
};

export const removeBufferMessages = (
  messages: ConversationMessages,
  bufferId: string,
  replacementBuffer?: BufferState | null,
) => {
  const key = bufferId;
  if (!(key in messages)) {
    return messages;
  }
  if (replacementBuffer) {
    const replacementKey = replacementBuffer.id;
    const replacementBucket = messages[replacementKey] ?? [];
    const movedBucket = messages[key].map((message) => ({
      ...message,
      bufferId: replacementBuffer.id,
      networkId: replacementBuffer.networkId,
      target: replacementBuffer.target,
    }));
    const next = {
      ...messages,
      [replacementKey]: mergeMessageBucket(replacementBucket, movedBucket),
    };
    delete next[key];
    return next;
  }
  const next = { ...messages };
  delete next[key];
  return next;
};

export const removeNetworkMessages = (messages: ConversationMessages, networkId: string) => {
  const next = Object.fromEntries(
    Object.entries(messages).filter(([, bucket]) => !bucket.some((message) => message.networkId === networkId))
  );
  return Object.keys(next).length === Object.keys(messages).length ? messages : next;
};

export const removeConversationMessages = (
  messages: ConversationMessages,
  networkId: string,
  target: string,
  messageIds: string[],
  bufferId?: string,
) => {
  if (messageIds.length === 0) {
    return messages;
  }
  const keys = bufferId
    ? [bufferId]
    : findConversationBucketsByTarget(messages, networkId, target);
  if (keys.length === 0) {
    return messages;
  }
  const deletedIds = new Set(messageIds);
  let changed = false;
  const next = { ...messages };
  for (const key of keys) {
    const bucket = next[key];
    if (!bucket || bucket.length === 0) {
      continue;
    }
    const nextBucket = bucket.filter((message) => !deletedIds.has(message.id));
    if (nextBucket.length === bucket.length) {
      continue;
    }
    changed = true;
    if (nextBucket.length === 0) {
      delete next[key];
    } else {
      next[key] = nextBucket;
    }
  }
  return changed ? next : messages;
};

const mergeMessageBucket = (current: ChatMessage[], incoming: ChatMessage[]) =>
  normalizeMessageBucket([...current, ...incoming]);

const groupMessagesByConversation = (messages: ChatMessage[]) => {
  const grouped = new Map<string, ChatMessage[]>();
  for (const message of messages) {
    const key = message.bufferId;
    const bucket = grouped.get(key);
    if (bucket) {
      bucket.push(message);
      continue;
    }
    grouped.set(key, [message]);
  }
  return grouped;
};

const findConversationBucketsByTarget = (
  messages: ConversationMessages,
  networkId: string,
  target: string,
) => Object.entries(messages)
  .filter(([, bucket]) => bucket.some((message) =>
    message.networkId === networkId
    && normalizeIrcIdentifier(message.target) === normalizeIrcIdentifier(target)
  ))
  .map(([key]) => key);

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
  return incoming.some((message) => currentIds.has(message.id));
};

const limitMessageBucket = (bucket: ChatMessage[], maxMessages: number | undefined) =>
  typeof maxMessages === 'number' && maxMessages > 0 && bucket.length > maxMessages
    ? bucket.slice(-maxMessages)
    : bucket;
