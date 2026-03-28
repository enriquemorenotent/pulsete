import type {
  AssistantActiveBuffer,
  AssistantAskEvidenceGroup,
  AssistantAskRetrievalMemory,
  AssistantAskRetrievalRequest,
} from '../shared/protocol.js';

type RetrievalMemoryInput<TRequest extends AssistantAskRetrievalRequest> = {
  subject: AssistantActiveBuffer;
  request: TRequest;
  stage: AssistantAskRetrievalMemory['stage'];
  query: string;
  confidence: number;
  scoreSummary: string;
  contextLines: string[];
  matchCount: number;
  matchedMessageIds: string[];
  windowMessageIds: string[][];
  evidenceMessageIds: string[];
  evidenceGroups: AssistantAskEvidenceGroup[];
};

export const createRetrievalMemory = <TRequest extends AssistantAskRetrievalRequest>(
  input: RetrievalMemoryInput<TRequest>,
): AssistantAskRetrievalMemory => ({
  subject: input.subject,
  request: input.request,
  stage: input.stage,
  query: input.query,
  confidence: input.confidence,
  scoreSummary: input.scoreSummary,
  context: input.contextLines.join('\n'),
  matchCount: input.matchCount,
  matchedMessageIds: input.matchedMessageIds,
  windowMessageIds: input.windowMessageIds,
  evidenceMessageIds: input.evidenceMessageIds,
  evidenceGroups: input.evidenceGroups,
});
