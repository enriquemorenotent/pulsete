import { historyWindowLimit, type ChatMessage } from '../../shared/protocol-chat.js';

type ConversationMessages = Record<string, ChatMessage[]>;

export type ConversationMessageRetentionLimits = {
  selected: number;
  inactive: number;
  global: number;
};

export const inactiveConversationMessageLimit = historyWindowLimit;
export const selectedConversationMessageLimit = historyWindowLimit * 4;
export const globalConversationMessageLimit = historyWindowLimit * 20;

export const conversationMessageRetentionLimits: ConversationMessageRetentionLimits = {
  selected: selectedConversationMessageLimit,
  inactive: inactiveConversationMessageLimit,
  global: globalConversationMessageLimit,
};

export const conversationMessageLimitFor = (
  bufferId: string,
  selectedBufferId: string | null,
  limits = conversationMessageRetentionLimits,
) => bufferId === selectedBufferId ? limits.selected : limits.inactive;

export const retainConversationMessageBudget = <T extends ConversationMessages>(
  messages: T,
  selectedBufferId: string | null,
  limits = conversationMessageRetentionLimits,
): T => {
  let next: ConversationMessages | null = null;
  let totalMessages = 0;
  for (const [bufferId, bucket] of Object.entries(messages)) {
    const limit = conversationMessageLimitFor(bufferId, selectedBufferId, limits);
    const retained = bucket.length > limit ? bucket.slice(-limit) : bucket;
    totalMessages += retained.length;
    if (retained !== bucket) {
      next ??= { ...messages };
      next[bufferId] = retained;
    }
  }
  if (totalMessages <= limits.global) {
    return (next ?? messages) as T;
  }

  const retainedMessages = next ?? { ...messages };
  const leastRecentlyActive = Object.entries(retainedMessages).sort(
    ([leftId, left], [rightId, right]) => {
      const leftSelected = leftId === selectedBufferId;
      const rightSelected = rightId === selectedBufferId;
      if (leftSelected !== rightSelected) {
        return leftSelected ? 1 : -1;
      }
      return bucketActivity(left) - bucketActivity(right) || leftId.localeCompare(rightId);
    },
  );
  let excess = totalMessages - limits.global;
  for (const [bufferId, bucket] of leastRecentlyActive) {
    if (excess <= 0) {
      break;
    }
    delete retainedMessages[bufferId];
    excess -= bucket.length;
  }
  return retainedMessages as T;
};

const bucketActivity = (bucket: ChatMessage[]) => bucket[bucket.length - 1]?.ts ?? -Infinity;
