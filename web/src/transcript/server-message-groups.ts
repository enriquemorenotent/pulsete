import type { ChatMessage } from '../../../shared/protocol-chat.js';
import { getServerMessageSourceLabel } from '../chat-pane-message-utils.js';
import type {
  ChatTranscriptGroup,
  ChatTranscriptMessageRow,
} from './model.js';

export type ChatTranscriptServerGroupTone = 'notice' | 'system';

export type ChatTranscriptServerGroupRow = {
  kind: 'server-group';
  key: string;
  messageRows: ChatTranscriptMessageRow[];
  sourceLabel: string;
  tone: ChatTranscriptServerGroupTone;
};

export type PendingServerGroup = {
  activeGroup: ChatTranscriptGroup;
  messageRows: ChatTranscriptMessageRow[];
  sourceLabel: string;
  tone: ChatTranscriptServerGroupTone;
};

export type ServerGroupDescriptor = {
  sourceLabel: string;
  tone: ChatTranscriptServerGroupTone;
};

export const buildServerGroupRow = (
  pendingGroup: PendingServerGroup | null,
): ChatTranscriptServerGroupRow | null => {
  if (!pendingGroup) {
    return null;
  }
  const firstMessage = pendingGroup.messageRows[0]?.message;
  const lastMessage = pendingGroup.messageRows.at(-1)?.message;
  if (!firstMessage || !lastMessage) {
    return null;
  }
  return {
    kind: 'server-group',
    key: `server-group:${firstMessage.id}:${lastMessage.id}`,
    messageRows: pendingGroup.messageRows,
    sourceLabel: pendingGroup.sourceLabel,
    tone: pendingGroup.tone,
  };
};

export const resolveServerGroupDescriptor = (
  message: ChatMessage,
): ServerGroupDescriptor | null => {
  if (!isServerGroupableMessage(message)) {
    return null;
  }
  const sourceLabel = getServerMessageSourceLabel(message);
  if (!sourceLabel) {
    return null;
  }
  return {
    sourceLabel,
    tone: message.kind === 'notice' ? 'notice' : 'system',
  };
};

const isServerGroupableMessage = (message: ChatMessage) =>
  message.kind === 'system'
  || message.kind === 'notice'
  || message.kind === 'line'
  || message.kind === 'action';

export const shouldFlushServerGroup = (
  pendingGroup: PendingServerGroup | null,
  activeGroup: ChatTranscriptGroup,
  descriptor: ServerGroupDescriptor,
) =>
  !!pendingGroup
  && (
    pendingGroup.activeGroup !== activeGroup
    || pendingGroup.sourceLabel !== descriptor.sourceLabel
    || pendingGroup.tone !== descriptor.tone
  );

export const appendServerMessageRow = (input: {
  activeGroup: ChatTranscriptGroup;
  descriptor: ServerGroupDescriptor;
  message: ChatMessage;
  messageIndex: number;
  pendingServerGroup: PendingServerGroup | null;
}) => {
  const matchingPendingGroup =
    input.pendingServerGroup
    && input.pendingServerGroup.activeGroup === input.activeGroup
    && input.pendingServerGroup.sourceLabel === input.descriptor.sourceLabel
    && input.pendingServerGroup.tone === input.descriptor.tone
      ? input.pendingServerGroup
      : null;
  const pendingGroup = matchingPendingGroup ?? {
    activeGroup: input.activeGroup,
    messageRows: [],
    sourceLabel: input.descriptor.sourceLabel,
    tone: input.descriptor.tone,
  };
  pendingGroup.messageRows.push({
    kind: 'message',
    key: `message:${input.message.id}`,
    hideTimestamp: false,
    message: input.message,
    messageIndex: input.messageIndex,
  });
  return pendingGroup;
};
