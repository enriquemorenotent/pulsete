import type { ChatMessage } from '../../shared/protocol.js';
import {
  formatDayDividerLabel,
  getServerMessageSourceLabel,
  isCompactMessage,
} from './chat-pane-message-utils.js';

export type ChatTranscriptRow =
  | {
      kind: 'message';
      key: string;
      hideTimestamp: boolean;
      message: ChatMessage;
      messageIndex: number;
    }
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
  unreadDividerKey: string;
};

export const buildChatTranscriptModel = (
  input: BuildChatTranscriptModelInput,
): ChatTranscriptModel => {
  const groups: ChatTranscriptGroup[] = [];
  const flatRows: ChatTranscriptRow[] = [];
  let previousDayKey: string | null = null;
  let previousTimestampGroupKey: string | null = null;
  let unreadRowIndex: number | null = null;

  input.messages.forEach((message, messageIndex) => {
    const dayKey = getLocalDayKey(message.ts);
    if (dayKey !== previousDayKey) {
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
      const unreadRow: ChatTranscriptRow = {
        kind: 'unread-divider',
        key: input.unreadDividerKey,
      };
      unreadRowIndex = flatRows.length;
      activeGroup.rows.push(unreadRow);
      flatRows.push(unreadRow);
    }

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

  return {
    flatRows,
    groupCounts: groups.map((group) => group.rows.length),
    groups,
    unreadRowIndex,
  };
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
  return [
    date.getFullYear(),
    padDatePart(date.getMonth() + 1),
    padDatePart(date.getDate()),
  ].join('-');
};

const padDatePart = (value: number) => String(value).padStart(2, '0');
