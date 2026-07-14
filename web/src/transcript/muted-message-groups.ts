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
  return buildMutedRow(pendingGroup.messageRows, pendingGroup.nick);
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
  });
  pendingGroup.previousTimestampGroupKey = timestampGroupKey;
  return pendingGroup;
};

export const extendMutedGroupRow = (input: {
  listKind: 'chat' | 'server';
  message: ChatMessage;
  mutedNick: string;
  row: ChatTranscriptMutedGroupRow;
}): ChatTranscriptMutedGroupRow | null => {
  const firstMessage = input.row.messageRows[0]?.message;
  if (
    !firstMessage
    || firstMessage.networkId !== input.message.networkId
    || normalizeIrcIdentifier(input.row.nick) !== normalizeIrcIdentifier(input.mutedNick)
  ) {
    return null;
  }
  const previousMessage = input.row.messageRows.at(-1)?.message;
  const timestampGroupKey = resolveTimestampGroupKey(input.message, input.listKind);
  const previousTimestampGroupKey = previousMessage
    ? resolveTimestampGroupKey(previousMessage, input.listKind)
    : null;
  return buildMutedRow([
    ...input.row.messageRows,
    {
      kind: 'message',
      key: `message:${input.message.id}`,
      hideTimestamp:
        timestampGroupKey !== null
        && timestampGroupKey === previousTimestampGroupKey,
      message: input.message,
    },
  ], input.row.nick);
};

export const trimMutedGroupRow = (
  row: ChatTranscriptMutedGroupRow,
  firstMessageIndex: number,
) => {
  const messageRows = row.messageRows.slice(firstMessageIndex);
  const firstRow = messageRows[0];
  if (!firstRow) {
    return null;
  }
  messageRows[0] = firstRow.hideTimestamp
    ? { ...firstRow, hideTimestamp: false }
    : firstRow;
  return buildMutedRow(messageRows, row.nick);
};

const buildMutedRow = (
  messageRows: ChatTranscriptMessageRow[],
  nick: string,
): ChatTranscriptMutedGroupRow | null => {
  const firstMessage = messageRows[0]?.message;
  const lastMessage = messageRows.at(-1)?.message;
  if (!firstMessage || !lastMessage) {
    return null;
  }
  return {
    kind: 'muted-group',
    key: `muted-group:${firstMessage.id}:${lastMessage.id}`,
    firstMessageId: firstMessage.id,
    lastMessageId: lastMessage.id,
    messageCount: messageRows.length,
    messageRows,
    nick,
  };
};
