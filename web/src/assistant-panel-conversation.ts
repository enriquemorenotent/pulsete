import type {
  AssistantAskEvidenceGroup,
  AssistantAttachmentMetadata,
  AssistantItem,
  AssistantThread,
  AssistantTurn,
} from '../../shared/protocol.js';

export type ConversationEntry = {
  attachments: AssistantAttachmentMetadata[];
  evidenceGroups: AssistantAskEvidenceGroup[];
  id: string;
  role: 'user' | 'assistant' | 'error';
  text: string;
};

export const buildAssistantConversation = (thread: AssistantThread | null): ConversationEntry[] => {
  if (!thread) {
    return [];
  }
  return thread.turns.flatMap((turn) => {
    const evidenceGroups = thread.task === 'ask' ? collectTurnEvidenceGroups(turn) : [];
    const lastAssistantItemId = findLastAssistantItemId(turn.items);
    const items = turn.items.flatMap((item) => mapItemToConversationEntry(item, {
      evidenceGroups: item.id === lastAssistantItemId ? evidenceGroups : [],
    }));
    if (turn.status !== 'failed' || !turn.error) {
      return items;
    }
    return [...items, {
      id: `${turn.id}-error`,
      role: 'error',
      text: turn.error,
      attachments: [],
      evidenceGroups: [],
    }];
  });
};

const mapItemToConversationEntry = (
  item: AssistantItem,
  options: { evidenceGroups: AssistantAskEvidenceGroup[] },
): ConversationEntry[] => {
  if (item.type === 'userMessage') {
    return [{
      id: item.id,
      role: 'user',
      text: item.text,
      attachments: item.attachments,
      evidenceGroups: [],
    }];
  }
  if (item.type === 'agentMessage' && item.text.trim()) {
    return [{
      id: item.id,
      role: 'assistant',
      text: item.text,
      attachments: [],
      evidenceGroups: options.evidenceGroups,
    }];
  }
  return [];
};

const findLastAssistantItemId = (items: AssistantItem[]) => {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    if (item?.type === 'agentMessage' && item.text.trim()) {
      return item.id;
    }
  }
  return null;
};

const collectTurnEvidenceGroups = (turn: AssistantTurn) => {
  const retrievals = turn.routing?.retrievals?.length
    ? turn.routing.retrievals
    : turn.routing?.retrieval
      ? [turn.routing.retrieval]
      : [];
  const groupsByHeading = new Map<string, AssistantAskEvidenceGroup>();
  const merged: AssistantAskEvidenceGroup[] = [];

  for (const retrieval of retrievals) {
    for (const group of retrieval.evidenceGroups ?? []) {
      const heading = group.heading.trim();
      const lines = group.lines.filter((line) => line.body.trim());
      if (!heading || lines.length === 0) {
        continue;
      }
      const existing = groupsByHeading.get(heading);
      if (existing) {
        for (const line of lines) {
          if (!existing.lines.some((candidate) => candidate.messageId === line.messageId)) {
            existing.lines.push(line);
          }
        }
        continue;
      }
      const nextGroup = { heading, lines: [...lines] };
      groupsByHeading.set(heading, nextGroup);
      merged.push(nextGroup);
    }
  }

  return merged;
};
