import { normalizeIrcIdentifier } from '../../shared/irc-identifiers.js';
import type { BufferState, ChatMessage } from '../../shared/protocol-chat.js';
import {
  applyMessageBucketMutation,
  normalizeMessageBucket,
} from './conversation-message-buckets.js';
import { conversationMessageLimitFor } from './conversation-message-retention.js';

export {
  globalConversationMessageLimit,
  inactiveConversationMessageLimit,
  retainConversationMessageBudget,
  selectedConversationMessageLimit,
  selectedConversationMessageLimit as retainedConversationMessageLimit,
} from './conversation-message-retention.js';

export type ConversationMessages = Record<string, ChatMessage[]>;

export type ConversationMessageMutation =
  | { kind: 'append' | 'upsert'; message: ChatMessage }
  | { kind: 'append-batch' | 'prepend-batch'; messages: ChatMessage[] };

export const toConversationMessageKey = (networkId: string, target: string) =>
  `${networkId}:${normalizeIrcIdentifier(target)}`;

export const indexConversationMessages = (messages: ChatMessage[]): ConversationMessages => {
  const buckets: ConversationMessages = {};
  for (const [key, bucket] of groupMessagesByConversation(messages)) {
    buckets[key] = normalizeMessageBucket(bucket);
  }
  return buckets;
};

export const mutateConversationMessages = (
  current: ConversationMessages,
  mutation: ConversationMessageMutation,
  selectedBufferId: string | null,
): ConversationMessages => {
  const incoming = 'message' in mutation ? [mutation.message] : mutation.messages;
  if (incoming.length === 0) {
    return current;
  }
  const next = { ...current };
  for (const [key, bucket] of groupMessagesByConversation(incoming)) {
    next[key] = applyMessageBucketMutation(
      mutation.kind,
      next[key] ?? [],
      bucket,
      selectedBufferId ? conversationMessageLimitFor(key, selectedBufferId) : undefined,
    );
  }
  return next;
};

export const replaceConversationMessageBucket = (
  current: ConversationMessages,
  bufferId: string,
  messages: ChatMessage[],
): ConversationMessages => {
  const normalized = normalizeMessageBucket(
    messages.filter((message) => message.bufferId === bufferId),
  );
  if (normalized.length === 0) {
    if (!(bufferId in current)) {
      return current;
    }
    const next = { ...current };
    delete next[bufferId];
    return next;
  }
  return { ...current, [bufferId]: normalized };
};

export const updateExistingConversationMessage = (
  current: ConversationMessages,
  message: ChatMessage,
): ConversationMessages => {
  const bucket = current[message.bufferId];
  if (!bucket) {
    return current;
  }
  const index = bucket.findIndex(({ id }) => id === message.id);
  if (index < 0 || bucket[index] === message) {
    return current;
  }
  const nextBucket = bucket.slice();
  nextBucket[index] = message;
  return { ...current, [message.bufferId]: normalizeMessageBucket(nextBucket) };
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
      [replacementKey]: applyMessageBucketMutation(
        'merge',
        replacementBucket,
        movedBucket,
      ),
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
) => {
  const normalizedTarget = normalizeIrcIdentifier(target);
  const keys: string[] = [];
  for (const [key, bucket] of Object.entries(messages)) {
    if (bucket.some((message) =>
      message.networkId === networkId
      && normalizeIrcIdentifier(message.target) === normalizedTarget
    )) {
      keys.push(key);
    }
  }
  return keys;
};
