import type { ChatMessage } from '../../../shared/protocol-chat.js';
import { formatDayDividerLabel } from '../chat-pane-message-utils.js';
import { resolveMutedMessageNick } from '../muted-nick-utils.js';
import {
  appendMutedMessageRow,
  buildMutedGroupRow,
  extendMutedGroupRow,
  trimMutedGroupRow,
} from './muted-message-groups.js';
import type {
  BuildChatTranscriptModelInput,
  ChatTranscriptGroup,
  ChatTranscriptModel,
  ChatTranscriptRow,
} from './model.js';
import {
  appendServerMessageRow,
  buildServerGroupRow,
  extendServerGroupRow,
  resolveServerGroupDescriptor,
  trimServerGroupRow,
} from './server-message-groups.js';
import { getLocalDayKey, resolveTimestampGroupKey } from './timestamp-groups.js';

type MessageLocation = {
  flatGroupOffset: number;
  groupIndex: number;
  nestedMessageIndex: number | null;
  rowIndex: number;
};

export const appendChatTranscriptMessages = (
  baseModel: ChatTranscriptModel,
  input: BuildChatTranscriptModelInput,
  firstMessageIndex: number,
  ownsModelArrays = false,
  now = Date.now(),
): ChatTranscriptModel => {
  const flatRows = ownsModelArrays
    ? baseModel.flatRows
    : baseModel.flatRows.slice();
  const groups = ownsModelArrays ? baseModel.groups : baseModel.groups.slice();
  let activeGroup = cloneLastGroup(groups);
  let unreadRowIndex = baseModel.unreadRowIndex;

  const appendRow = (row: ChatTranscriptRow) => {
    activeGroup?.rows.push(row);
    flatRows.push(row);
  };
  const replaceLastRow = (row: ChatTranscriptRow) => {
    if (!activeGroup || activeGroup.rows.length === 0 || flatRows.length === 0) {
      return;
    }
    activeGroup.rows[activeGroup.rows.length - 1] = row;
    flatRows[flatRows.length - 1] = row;
  };

  for (let messageIndex = firstMessageIndex; messageIndex < input.messages.length; messageIndex += 1) {
    const message = input.messages[messageIndex];
    const dayKey = getLocalDayKey(message.ts);
    if (activeGroup?.key !== `day-${dayKey}`) {
      activeGroup = createDayGroup(message, dayKey, now);
      groups.push(activeGroup);
      flatRows.push(activeGroup.rows[0]);
    }
    if (input.firstUnreadDividerIndex === messageIndex) {
      unreadRowIndex = flatRows.length;
      appendRow({ kind: 'unread-divider', key: input.unreadDividerKey });
    }

    const lastRow = activeGroup.rows.at(-1);
    const mutedNick = resolveMutedMessageNick(input.mutedNicks, message);
    if (mutedNick) {
      const extended = lastRow?.kind === 'muted-group'
        ? extendMutedGroupRow({
            listKind: input.listKind,
            message,
            mutedNick,
            row: lastRow,
          })
        : null;
      if (extended) {
        replaceLastRow(extended);
      } else {
        appendRow(createMutedGroup(activeGroup, input, message, mutedNick));
      }
      continue;
    }

    const descriptor = input.listKind === 'server'
      ? resolveServerGroupDescriptor(message)
      : null;
    if (descriptor) {
      const extended = lastRow?.kind === 'server-group'
        ? extendServerGroupRow({ descriptor, message, row: lastRow })
        : null;
      if (extended) {
        replaceLastRow(extended);
      } else {
        appendRow(createServerGroup(activeGroup, descriptor, message));
      }
      continue;
    }

    const timestampGroupKey = resolveTimestampGroupKey(message, input.listKind);
    const previousTimestampGroupKey = lastRow?.kind === 'message'
      ? resolveTimestampGroupKey(lastRow.message, input.listKind)
      : null;
    appendRow({
      kind: 'message',
      key: `message:${message.id}`,
      hideTimestamp:
        timestampGroupKey !== null
        && timestampGroupKey === previousTimestampGroupKey,
      message,
    });
  }

  return { flatRows, groups, unreadRowIndex };
};

export const trimChatTranscriptModel = (
  model: ChatTranscriptModel,
  firstRetainedMessage: ChatMessage,
): ChatTranscriptModel | null => {
  const location = findMessageLocation(model, firstRetainedMessage);
  if (!location) {
    return null;
  }
  const sourceGroup = model.groups[location.groupIndex];
  const sourceRow = sourceGroup?.rows[location.rowIndex];
  const dayDivider = sourceGroup?.rows[0];
  if (!sourceGroup || !sourceRow || dayDivider?.kind !== 'day-divider') {
    return null;
  }
  const previousRow = sourceGroup.rows[location.rowIndex - 1];
  const tailStart = previousRow?.kind === 'unread-divider'
    ? location.rowIndex - 1
    : location.rowIndex;
  const rows = [dayDivider, ...sourceGroup.rows.slice(Math.max(1, tailStart))];
  const retainedRowIndex = 1 + location.rowIndex - Math.max(1, tailStart);
  const retainedRow = trimLeadingRow(sourceRow, location.nestedMessageIndex);
  if (!retainedRow) {
    return null;
  }
  rows[retainedRowIndex] = retainedRow;
  const firstGroup = { ...sourceGroup, rows };
  const groups = [firstGroup, ...model.groups.slice(location.groupIndex + 1)];
  const followingRows = model.flatRows.slice(
    location.flatGroupOffset + sourceGroup.rows.length,
  );
  const flatRows = [...rows, ...followingRows];
  const unreadIndex = flatRows.findIndex((row) => row.kind === 'unread-divider');
  return {
    flatRows,
    groups,
    unreadRowIndex: unreadIndex < 0 ? null : unreadIndex,
  };
};

const cloneLastGroup = (groups: ChatTranscriptGroup[]) => {
  const lastGroup = groups.at(-1);
  if (!lastGroup) {
    return null;
  }
  const clone = { ...lastGroup, rows: lastGroup.rows.slice() };
  groups[groups.length - 1] = clone;
  return clone;
};

const createDayGroup = (message: ChatMessage, dayKey: string, now: number): ChatTranscriptGroup => {
  const label = formatDayDividerLabel(message.ts, now);
  return {
    key: `day-${dayKey}`,
    label,
    rows: [{ kind: 'day-divider', key: `day-divider:${dayKey}`, label }],
  };
};

const createMutedGroup = (
  activeGroup: ChatTranscriptGroup,
  input: BuildChatTranscriptModelInput,
  message: ChatMessage,
  mutedNick: string,
) => buildMutedGroupRow(appendMutedMessageRow({
  activeGroup,
  listKind: input.listKind,
  message,
  mutedNick,
  pendingMutedGroup: null,
}))!;

const createServerGroup = (
  activeGroup: ChatTranscriptGroup,
  descriptor: NonNullable<ReturnType<typeof resolveServerGroupDescriptor>>,
  message: ChatMessage,
) => buildServerGroupRow(appendServerMessageRow({
  activeGroup,
  descriptor,
  message,
  pendingServerGroup: null,
}))!;

const findMessageLocation = (
  model: ChatTranscriptModel,
  message: ChatMessage,
): MessageLocation | null => {
  let flatGroupOffset = 0;
  for (let groupIndex = 0; groupIndex < model.groups.length; groupIndex += 1) {
    const group = model.groups[groupIndex];
    for (let rowIndex = 0; rowIndex < group.rows.length; rowIndex += 1) {
      const row = group.rows[rowIndex];
      if (row.kind === 'message' && row.message === message) {
        return { flatGroupOffset, groupIndex, nestedMessageIndex: null, rowIndex };
      }
      if (row.kind === 'muted-group' || row.kind === 'server-group') {
        const nestedMessageIndex = row.messageRows.findIndex(
          (messageRow) => messageRow.message === message,
        );
        if (nestedMessageIndex >= 0) {
          return { flatGroupOffset, groupIndex, nestedMessageIndex, rowIndex };
        }
      }
    }
    flatGroupOffset += group.rows.length;
  }
  return null;
};

const trimLeadingRow = (
  row: ChatTranscriptRow,
  nestedMessageIndex: number | null,
): ChatTranscriptRow | null => {
  if (row.kind === 'message') {
    return row.hideTimestamp ? { ...row, hideTimestamp: false } : row;
  }
  if (row.kind === 'muted-group' && nestedMessageIndex !== null) {
    return nestedMessageIndex === 0 ? row : trimMutedGroupRow(row, nestedMessageIndex);
  }
  if (row.kind === 'server-group' && nestedMessageIndex !== null) {
    return nestedMessageIndex === 0 ? row : trimServerGroupRow(row, nestedMessageIndex);
  }
  return null;
};
