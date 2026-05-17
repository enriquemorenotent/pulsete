import type { ChatMessage, MutedNickState } from '../../../shared/protocol-chat.js';
import { formatDayDividerLabel } from '../chat-pane-message-utils.js';
import { resolveMutedMessageNick } from '../muted-nick-utils.js';
import {
  appendMutedMessageRow,
  buildMutedGroupRow,
  shouldFlushMutedGroup,
  type PendingMutedGroup,
} from './muted-message-groups.js';
import {
  appendServerMessageRow,
  buildServerGroupRow,
  resolveServerGroupDescriptor,
  shouldFlushServerGroup,
  type ChatTranscriptServerGroupRow,
  type PendingServerGroup,
} from './server-message-groups.js';
import {
  getLocalDayKey,
  resolveTimestampGroupKey,
} from './timestamp-groups.js';

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

export type ChatTranscriptDayDividerRow = {
  kind: 'day-divider';
  key: string;
  label: string;
};

export type ChatTranscriptRow =
  | ChatTranscriptDayDividerRow
  | ChatTranscriptMessageRow
  | ChatTranscriptMutedGroupRow
  | ChatTranscriptServerGroupRow
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

export const buildChatTranscriptModel = (
  input: BuildChatTranscriptModelInput,
): ChatTranscriptModel => {
  const groups: ChatTranscriptGroup[] = [];
  const flatRows: ChatTranscriptRow[] = [];
  let pendingMutedGroup: PendingMutedGroup | null = null;
  let pendingServerGroup: PendingServerGroup | null = null;
  let previousDayKey: string | null = null;
  let previousTimestampGroupKey: string | null = null;
  let unreadRowIndex: number | null = null;

  const flushMutedGroup = () => {
    if (!pendingMutedGroup) {
      return;
    }
    const row = buildMutedGroupRow(pendingMutedGroup);
    if (row) {
      pendingMutedGroup.activeGroup.rows.push(row);
      flatRows.push(row);
    }
    pendingMutedGroup = null;
    previousTimestampGroupKey = null;
  };

  const flushServerGroup = () => {
    if (!pendingServerGroup) {
      return;
    }
    const row = buildServerGroupRow(pendingServerGroup);
    if (row) {
      pendingServerGroup.activeGroup.rows.push(row);
      flatRows.push(row);
    }
    pendingServerGroup = null;
    previousTimestampGroupKey = null;
  };

  input.messages.forEach((message, messageIndex) => {
    const dayKey = getLocalDayKey(message.ts);
    if (dayKey !== previousDayKey) {
      flushMutedGroup();
      flushServerGroup();
      const group: ChatTranscriptGroup = {
        key: `day-${dayKey}`,
        label: formatDayDividerLabel(message.ts),
        rows: [],
      };
      const dayDividerRow: ChatTranscriptDayDividerRow = {
        kind: 'day-divider',
        key: `day-divider:${dayKey}`,
        label: group.label,
      };
      group.rows.push(dayDividerRow);
      groups.push(group);
      flatRows.push(dayDividerRow);
      previousDayKey = dayKey;
      previousTimestampGroupKey = null;
    }

    const activeGroup = groups.at(-1);
    if (!activeGroup) {
      return;
    }

    if (input.firstUnreadDividerIndex === messageIndex) {
      flushMutedGroup();
      flushServerGroup();
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
      flushServerGroup();
      if (shouldFlushMutedGroup(pendingMutedGroup, activeGroup, message, mutedNick)) {
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

    const serverGroupDescriptor = input.listKind === 'server'
      ? resolveServerGroupDescriptor(message)
      : null;
    if (serverGroupDescriptor) {
      flushMutedGroup();
      if (shouldFlushServerGroup(pendingServerGroup, activeGroup, serverGroupDescriptor)) {
        flushServerGroup();
      }
      pendingServerGroup = appendServerMessageRow({
        activeGroup,
        descriptor: serverGroupDescriptor,
        message,
        messageIndex,
        pendingServerGroup,
      });
      previousTimestampGroupKey = null;
      return;
    }

    flushMutedGroup();
    flushServerGroup();
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
  flushServerGroup();

  return {
    flatRows,
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

export type { ChatTranscriptServerGroupRow } from './server-message-groups.js';
