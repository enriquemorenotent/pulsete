import { normalizeIrcIdentifier } from '../../../shared/irc-identifiers.js';
import type { ChatMessage, MutedNickState } from '../../../shared/protocol-chat.js';
import {
  formatDayDividerLabel,
  getServerMessageSourceLabel,
  isCompactMessage,
} from '../chat-pane-message-utils.js';
import { resolveMutedMessageNick } from '../muted-nick-utils.js';

export type ChatTranscriptMessageRow = {
  kind: 'message';
  key: string;
  hideTimestamp: boolean;
  message: ChatMessage;
  messageIndex: number;
};

export type ChatTranscriptMutedGroupRow = {
  kind: 'muted-group';
  key: string;
  firstMessageId: string;
  lastMessageId: string;
  messageCount: number;
  messageRows: ChatTranscriptMessageRow[];
  nick: string;
};

export type ChatTranscriptRow =
  | ChatTranscriptMessageRow
  | ChatTranscriptMutedGroupRow
  | {
      kind: 'unread-divider';
      key: string;
    };

export type ChatTranscriptGroup = {
  key: string;
  label: string;
  rows: ChatTranscriptRow[];
};

export type ChatTranscriptModel = {
  flatRows: ChatTranscriptRow[];
  groupCounts: number[];
  groups: ChatTranscriptGroup[];
  unreadRowIndex: number | null;
};

type BuildChatTranscriptModelInput = {
  firstUnreadDividerIndex: number | null;
  listKind: 'chat' | 'server';
  messages: ChatMessage[];
  mutedNicks: readonly MutedNickState[];
  unreadDividerKey: string;
};

type PendingMutedGroup = {
  activeGroup: ChatTranscriptGroup;
  messageRows: ChatTranscriptMessageRow[];
  networkId: string;
  nick: string;
  nickKey: string;
  previousTimestampGroupKey: string | null;
};

export const buildChatTranscriptModel = (
  input: BuildChatTranscriptModelInput,
): ChatTranscriptModel => {
  const groups: ChatTranscriptGroup[] = [];
  const flatRows: ChatTranscriptRow[] = [];
  let pendingMutedGroup: PendingMutedGroup | null = null;
  let previousDayKey: string | null = null;
  let previousTimestampGroupKey: string | null = null;
  let unreadRowIndex: number | null = null;

  const flushMutedGroup = () => {
    if (!pendingMutedGroup) {
      return;
    }
    const firstMessage = pendingMutedGroup.messageRows[0]?.message;
    const lastMessage = pendingMutedGroup.messageRows.at(-1)?.message;
    if (!firstMessage || !lastMessage) {
      pendingMutedGroup = null;
      return;
    }
    const row: ChatTranscriptMutedGroupRow = {
      kind: 'muted-group',
      key: `muted-group:${firstMessage.id}:${lastMessage.id}`,
      firstMessageId: firstMessage.id,
      lastMessageId: lastMessage.id,
      messageCount: pendingMutedGroup.messageRows.length,
      messageRows: pendingMutedGroup.messageRows,
      nick: pendingMutedGroup.nick,
    };
    pendingMutedGroup.activeGroup.rows.push(row);
    flatRows.push(row);
    pendingMutedGroup = null;
    previousTimestampGroupKey = null;
  };

  input.messages.forEach((message, messageIndex) => {
    const dayKey = getLocalDayKey(message.ts);
    if (dayKey !== previousDayKey) {
      flushMutedGroup();
      groups.push({
        key: `day-${dayKey}`,
        label: formatDayDividerLabel(message.ts),
        rows: [],
      });
      previousDayKey = dayKey;
      previousTimestampGroupKey = null;
    }

    const activeGroup = groups.at(-1);
    if (!activeGroup) {
      return;
    }

    if (input.firstUnreadDividerIndex === messageIndex) {
      flushMutedGroup();
      const unreadRow: ChatTranscriptRow = {
        kind: 'unread-divider',
        key: input.unreadDividerKey,
      };
      unreadRowIndex = flatRows.length;
      activeGroup.rows.push(unreadRow);
      flatRows.push(unreadRow);
      previousTimestampGroupKey = null;
    }

    const mutedNick = resolveMutedMessageNick(input.mutedNicks, message);
    if (mutedNick) {
      const mutedNickKey = normalizeIrcIdentifier(mutedNick);
      if (
        pendingMutedGroup
        && (
          pendingMutedGroup.activeGroup !== activeGroup
          || pendingMutedGroup.networkId !== message.networkId
          || pendingMutedGroup.nickKey !== mutedNickKey
        )
      ) {
        flushMutedGroup();
      }
      pendingMutedGroup = appendMutedMessageRow({
        activeGroup,
        listKind: input.listKind,
        message,
        messageIndex,
        mutedNick,
        pendingMutedGroup,
      });
      previousTimestampGroupKey = null;
      return;
    }

    flushMutedGroup();
    const timestampGroupKey = resolveTimestampGroupKey(message, input.listKind);
    const row: ChatTranscriptRow = {
      kind: 'message',
      key: `message:${message.id}`,
      hideTimestamp:
        timestampGroupKey !== null
        && timestampGroupKey === previousTimestampGroupKey,
      message,
      messageIndex,
    };
    activeGroup.rows.push(row);
    flatRows.push(row);
    previousTimestampGroupKey = timestampGroupKey;
  });

  flushMutedGroup();

  return {
    flatRows,
    groupCounts: groups.map((group) => group.rows.length),
    groups,
    unreadRowIndex,
  };
};

export const pruneExpandedMutedGroupKeys = (
  current: ReadonlySet<string>,
  model: Pick<ChatTranscriptModel, 'flatRows'>,
) => {
  if (current.size === 0) {
    return current;
  }
  const visibleKeys = new Set(
    model.flatRows.flatMap((row) =>
      row.kind === 'muted-group' ? [row.key] : [],
    ),
  );
  let changed = false;
  const next = new Set<string>();
  for (const key of current) {
    if (visibleKeys.has(key)) {
      next.add(key);
      continue;
    }
    changed = true;
  }
  return changed ? next : current;
};

const appendMutedMessageRow = (input: {
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

const resolveTimestampGroupKey = (
  message: ChatMessage,
  listKind: 'chat' | 'server',
) => {
  const senderKey = resolveTimestampGroupSenderKey(message, listKind);
  if (!senderKey) {
    return null;
  }
  return `${senderKey}:${Math.floor(message.ts / 60_000)}`;
};

const resolveTimestampGroupSenderKey = (
  message: ChatMessage,
  listKind: 'chat' | 'server',
) => {
  if (listKind === 'server') {
    return getServerMessageSourceLabel(message);
  }
  if (!isCompactMessage(message)) {
    return null;
  }
  return message.nick ?? null;
};

const getLocalDayKey = (value: number) => {
  const date = new Date(value);
  return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}`;
};

const padDatePart = (value: number) => String(value).padStart(2, '0');
