import { normalizeIrcIdentifier } from '../../../shared/irc-identifiers.js';
import type { ChatMessage } from '../../../shared/protocol-chat.js';
import type {
  ChatTranscriptGroup,
  ChatTranscriptMessageRow,
  ChatTranscriptMutedGroupRow,
} from './model.js';
import { resolveTimestampGroupKey } from './timestamp-groups.js';

export type PendingMutedGroup = {
  activeGroup: ChatTranscriptGroup;
  messageRows: ChatTranscriptMessageRow[];
  networkId: string;
  nick: string;
  nickKey: string;
  previousTimestampGroupKey: string | null;
};

export const buildMutedGroupRow = (
  pendingGroup: PendingMutedGroup | null,
): ChatTranscriptMutedGroupRow | null => {
  if (!pendingGroup) {
    return null;
  }
  const firstMessage = pendingGroup.messageRows[0]?.message;
  const lastMessage = pendingGroup.messageRows.at(-1)?.message;
  if (!firstMessage || !lastMessage) {
    return null;
  }
  return {
    kind: 'muted-group',
    key: `muted-group:${firstMessage.id}:${lastMessage.id}`,
    firstMessageId: firstMessage.id,
    lastMessageId: lastMessage.id,
    messageCount: pendingGroup.messageRows.length,
    messageRows: pendingGroup.messageRows,
    nick: pendingGroup.nick,
  };
};

export const shouldFlushMutedGroup = (
  pendingGroup: PendingMutedGroup | null,
  activeGroup: ChatTranscriptGroup,
  message: ChatMessage,
  mutedNick: string,
) =>
  !!pendingGroup
  && (
    pendingGroup.activeGroup !== activeGroup
    || pendingGroup.networkId !== message.networkId
    || pendingGroup.nickKey !== normalizeIrcIdentifier(mutedNick)
  );

export const appendMutedMessageRow = (input: {
  activeGroup: ChatTranscriptGroup;
  listKind: 'chat' | 'server';
  message: ChatMessage;
  messageIndex: number;
  mutedNick: string;
  pendingMutedGroup: PendingMutedGroup | null;
}) => {
  const nickKey = normalizeIrcIdentifier(input.mutedNick);
  const matchingPendingGroup =
    input.pendingMutedGroup
    && input.pendingMutedGroup.activeGroup === input.activeGroup
    && input.pendingMutedGroup.networkId === input.message.networkId
    && input.pendingMutedGroup.nickKey === nickKey
      ? input.pendingMutedGroup
      : null;
  const pendingGroup = matchingPendingGroup ?? {
    activeGroup: input.activeGroup,
    messageRows: [],
    networkId: input.message.networkId,
    nick: input.mutedNick,
    nickKey,
    previousTimestampGroupKey: null,
  };
  const timestampGroupKey = resolveTimestampGroupKey(input.message, input.listKind);
  pendingGroup.messageRows.push({
    kind: 'message',
    key: `message:${input.message.id}`,
    hideTimestamp:
      timestampGroupKey !== null
      && timestampGroupKey === pendingGroup.previousTimestampGroupKey,
    message: input.message,
    messageIndex: input.messageIndex,
  });
  pendingGroup.previousTimestampGroupKey = timestampGroupKey;
  return pendingGroup;
};
