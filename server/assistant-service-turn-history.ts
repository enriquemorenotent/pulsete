import type {
  AssistantActiveBuffer,
  AssistantAskClarification,
  AssistantAskRetrievalMemory,
  AssistantAttachmentMetadata,
  AssistantTurn,
  AssistantTurnAttachmentInput,
  AssistantTurnRouting,
} from '../shared/protocol.js';
import { assistantTranscriptTurnLimit } from './assistant-service-shared.js';

export const findPendingAskClarification = (
  turns: AssistantTurn[],
): AssistantAskClarification | null => {
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const turn = turns[index];
    if (!turn || turn.status === 'failed') {
      continue;
    }
    const pendingClarification = turn.routing?.pendingClarification ?? null;
    if (pendingClarification && turnHasAssistantReply(turn)) {
      return pendingClarification;
    }
    return null;
  }
  return null;
};

export const findRecentAskResolvedSubject = (
  turns: AssistantTurn[],
): AssistantActiveBuffer | null => {
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const turn = turns[index];
    if (!turn || turn.status === 'failed') {
      continue;
    }
    if (turn.resolvedSubject && turnHasAssistantReply(turn)) {
      return turn.resolvedSubject;
    }
    return null;
  }
  return null;
};

export const findRecentAskRetrievals = (
  turns: AssistantTurn[],
): AssistantAskRetrievalMemory[] => {
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const turn = turns[index];
    if (!turn || turn.status === 'failed') {
      continue;
    }
    const retrievals = turn.routing?.retrievals?.length
      ? turn.routing.retrievals
      : turn.routing?.retrieval
        ? [turn.routing.retrieval]
        : [];
    if (retrievals.length > 0 && turnHasAssistantReply(turn)) {
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
  return next.pendingClarification || next.retrieval || next.retrievals.length > 0
    ? next
    : null;
};

export const renderAskRetrievalContexts = (
  retrievals: AssistantAskRetrievalMemory[],
) =>
  retrievals
    .map((retrieval, index) =>
      retrievals.length === 1
        ? retrieval.context
        : [`Retrieval round ${index + 1}:`, retrieval.context].join('\n'),
    )
    .join('\n\n---\n\n');

export const buildAssistantTranscript = (turns: AssistantTurn[]) => {
  const recentTurns = turns.slice(-assistantTranscriptTurnLimit);
  return recentTurns
    .flatMap((turn) => {
      const transcript = turn.items.flatMap((item) => {
        if (item.type === 'userMessage') {
          const sections = [
            `User: ${truncateTranscriptText(item.text.trim() || '(empty request)')}`,
          ];
          if (item.attachments.length > 0) {
            sections.push(
              `Attachments: ${item.attachments.map(renderAttachmentLabel).join(', ')}`,
            );
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
    })
    .join('\n\n---\n\n');
};

export const toAttachmentMetadata = (
  attachment: AssistantTurnAttachmentInput,
): AssistantAttachmentMetadata => ({
  id: attachment.id,
  name: attachment.name,
  mimeType: attachment.mimeType,
  size: attachment.size,
  kind: attachment.kind,
});

const turnHasAssistantReply = (turn: AssistantTurn) =>
  turn.items.some(
    (item) => item.type === 'agentMessage' && item.text.trim().length > 0,
  );

const truncateTranscriptText = (text: string, limit = 2000) =>
  text.length > limit ? `${text.slice(0, limit).trimEnd()}\n[…truncated…]` : text;

const renderAttachmentLabel = (attachment: AssistantAttachmentMetadata) =>
  `${attachment.name} (${attachment.kind}, ${attachment.mimeType}, ${attachment.size} bytes)`;
