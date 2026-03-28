import type {
  AssistantActiveBuffer,
  AssistantAskClarification,
  AssistantAskRetrievalMemory,
  AssistantArtifact,
  AssistantAttachmentMetadata,
  AssistantItem,
  AssistantTaskKind,
  AssistantTurn,
  AssistantTurnAttachmentInput,
  AssistantTurnRouting,
} from '../shared/protocol.js';
import { canonicalizeAssistantText } from '../shared/assistant-document.js';
import {
  extractAssistantUserPrompt,
  parseAssistantArtifact,
} from './assistant-prompts.js';
import {
  assistantTranscriptTurnLimit,
  type PendingExecutionBase,
  type RawThreadItem,
  type RawTurn,
  isString,
  toTurnError,
  toTurnStatus,
} from './assistant-service-shared.js';

export const upsertTurnItem = (items: AssistantItem[], nextItem: AssistantItem) => {
  const index = items.findIndex((item) => item.id === nextItem.id);
  if (index === -1) {
    return [...items, nextItem];
  }
  return items.map((item, itemIndex) => itemIndex === index ? nextItem : item);
};

export const upsertTurn = (turns: AssistantTurn[], nextTurn: AssistantTurn) => {
  const index = turns.findIndex((turn) => turn.id === nextTurn.id);
  if (index === -1) {
    return [...turns, nextTurn];
  }
  return turns.map((turn, turnIndex) => turnIndex === index ? nextTurn : turn);
};

export const mapTurn = (task: AssistantTaskKind, turn: RawTurn): AssistantTurn => {
  const items = Array.isArray(turn.items) ? turn.items : [];
  return {
    id: turn.id,
    status: toTurnStatus(turn.status),
    error: toTurnError(turn.error),
    items: items.map((item) => mapItem(task, item)),
    activeBuffer: null,
    resolvedSubject: null,
    routing: null,
  };
};

export const mapItem = (task: AssistantTaskKind, item: RawThreadItem): AssistantItem => {
  if (item.type === 'userMessage') {
    const content = 'content' in item && Array.isArray(item.content) ? item.content : [];
    return {
      type: 'userMessage',
      id: item.id,
      text: extractAssistantUserPrompt(
        content
          .map((entry) => entry.text ?? '')
          .join('\n')
          .trim()
      ),
      attachments: [],
    };
  }
  if (item.type === 'agentMessage') {
    const text = 'text' in item && typeof item.text === 'string' ? item.text : '';
    const normalizedText = task === 'ask' ? canonicalizeAssistantText(text) : text;
    const artifact = parseAssistantArtifact(task, text);
    return {
      type: 'agentMessage',
      id: item.id,
      text: normalizedText,
      phase: 'phase' in item && typeof item.phase === 'string' ? item.phase : null,
      artifact: artifact as AssistantArtifact | null,
    };
  }
  if (item.type === 'plan') {
    return {
      type: 'plan',
      id: item.id,
      text: 'text' in item && typeof item.text === 'string' ? item.text : '',
    };
  }
  if (item.type === 'reasoning') {
    return {
      type: 'reasoning',
      id: item.id,
      summary: 'summary' in item && Array.isArray(item.summary) ? item.summary.filter(isString) : [],
      content: 'content' in item && Array.isArray(item.content) ? item.content.filter(isString) : [],
    };
  }
  return {
    type: 'other',
    id: item.id,
    label: item.type,
    text: '',
  };
};

export const buildPendingTurn = (execution: PendingExecutionBase): AssistantTurn => ({
  id: execution.localTurnId,
  status: 'inProgress',
  error: null,
  items: [buildPendingUserMessage(execution.localTurnId, execution)],
  activeBuffer: execution.activeBuffer,
  resolvedSubject: execution.resolvedSubject,
  routing: execution.routing,
});

export const buildPendingUserItems = (turnId: string, execution: PendingExecutionBase | undefined) =>
  execution ? [buildPendingUserMessage(turnId, execution)] : [];

export const injectPendingUserMessage = (
  items: AssistantItem[],
  turnId: string,
  execution: PendingExecutionBase | undefined,
) => {
  const filtered = items.filter((item) => item.type !== 'userMessage');
  return execution ? [buildPendingUserMessage(turnId, execution), ...filtered] : filtered;
};

const buildPendingUserMessage = (turnId: string, execution: PendingExecutionBase): AssistantItem => ({
  type: 'userMessage',
  id: `${turnId}:user`,
  text: execution.prompt.trim(),
  attachments: execution.attachments,
});

export const normalizeStoredAssistantTurns = (
  task: AssistantTaskKind,
  turns: AssistantTurn[],
) => {
  if (task !== 'ask' || turns.length === 0) {
    return { turns, changed: false };
  }

  let changed = false;
  const normalizedTurns = turns.map((turn) => {
    let turnChanged = false;
    const items = turn.items.map((item) => {
      if (item.type !== 'agentMessage') {
        return item;
      }
      const text = canonicalizeAssistantText(item.text);
      if (text === item.text) {
        return item;
      }
      changed = true;
      turnChanged = true;
      return {
        ...item,
        text,
      };
    });
    return turnChanged ? { ...turn, items } : turn;
  });

  return {
    turns: changed ? normalizedTurns : turns,
    changed,
  };
};

export const findPendingAskClarification = (turns: AssistantTurn[]): AssistantAskClarification | null => {
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const turn = turns[index];
    if (!turn || turn.status === 'failed') {
      continue;
    }
    const pendingClarification = turn.routing?.pendingClarification ?? null;
    const hasAssistantReply = turn.items.some((item) => item.type === 'agentMessage' && item.text.trim().length > 0);
    if (pendingClarification && hasAssistantReply) {
      return pendingClarification;
    }
    return null;
  }
  return null;
};

export const findRecentAskResolvedSubject = (turns: AssistantTurn[]): AssistantActiveBuffer | null => {
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const turn = turns[index];
    if (!turn || turn.status === 'failed') {
      continue;
    }
    const hasAssistantReply = turn.items.some((item) => item.type === 'agentMessage' && item.text.trim().length > 0);
    if (turn.resolvedSubject && hasAssistantReply) {
      return turn.resolvedSubject;
    }
    return null;
  }
  return null;
};

export const findRecentAskRetrievals = (turns: AssistantTurn[]): AssistantAskRetrievalMemory[] => {
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const turn = turns[index];
    if (!turn || turn.status === 'failed') {
      continue;
    }
    const hasAssistantReply = turn.items.some((item) => item.type === 'agentMessage' && item.text.trim().length > 0);
    const retrievals = turn.routing?.retrievals?.length
      ? turn.routing.retrievals
      : turn.routing?.retrieval
        ? [turn.routing.retrieval]
        : [];
    if (retrievals.length > 0 && hasAssistantReply) {
      return retrievals;
    }
    return [];
  }
  return [];
};

export const mergeAskTurnRouting = (
  routing: AssistantTurnRouting | null,
  retrievals: AssistantAskRetrievalMemory[],
): AssistantTurnRouting | null => {
  const next = {
    ...(routing ?? {}),
    retrieval: retrievals.at(-1) ?? null,
    retrievals,
  };
  return next.pendingClarification || next.retrieval || next.retrievals.length > 0 ? next : null;
};

export const renderAskRetrievalContexts = (retrievals: AssistantAskRetrievalMemory[]) =>
  retrievals
    .map((retrieval, index) => retrievals.length === 1
      ? retrieval.context
      : [
          `Retrieval round ${index + 1}:`,
          retrieval.context,
        ].join('\n'))
    .join('\n\n---\n\n');

export const buildAssistantTranscript = (turns: AssistantTurn[]) => {
  const recentTurns = turns.slice(-assistantTranscriptTurnLimit);
  const entries = recentTurns.flatMap((turn) => {
    const transcript = turn.items.flatMap((item) => {
      if (item.type === 'userMessage') {
        const sections = [`User: ${truncateTranscriptText(item.text.trim() || '(empty request)')}`];
        if (item.attachments.length > 0) {
          sections.push(`Attachments: ${item.attachments.map(renderAttachmentLabel).join(', ')}`);
        }
        return [sections.join('\n')];
      }
      if (item.type === 'agentMessage' && item.text.trim()) {
        return [`Assistant: ${truncateTranscriptText(item.text.trim())}`];
      }
      return [];
    });
    if (turn.status === 'failed' && turn.error) {
      transcript.push(`Turn error: ${turn.error}`);
    }
    return transcript.length > 0 ? [transcript.join('\n\n')] : [];
  });
  return entries.join('\n\n---\n\n');
};

const truncateTranscriptText = (text: string, limit = 2000) =>
  text.length > limit ? `${text.slice(0, limit).trimEnd()}\n[…truncated…]` : text;

const renderAttachmentLabel = (attachment: AssistantAttachmentMetadata) =>
  `${attachment.name} (${attachment.kind}, ${attachment.mimeType}, ${attachment.size} bytes)`;

export const toAttachmentMetadata = (attachment: AssistantTurnAttachmentInput): AssistantAttachmentMetadata => ({
  id: attachment.id,
  name: attachment.name,
  mimeType: attachment.mimeType,
  size: attachment.size,
  kind: attachment.kind,
});
