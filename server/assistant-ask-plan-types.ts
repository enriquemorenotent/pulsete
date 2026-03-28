import type {
  AssistantActiveBuffer,
  AssistantAskClarification,
  AssistantAskRetrievalMemory,
  AssistantAskRetrievalRequest,
  AssistantProfileFactIntent,
  AssistantTurnRouting,
} from '../shared/protocol.js';

export type AssistantAskPlan =
  | {
      outcome: 'answer';
      instruction: string;
      resolvedSubject: AssistantActiveBuffer | null;
      routing: AssistantTurnRouting | null;
      reusePreviousRetrievals: boolean;
    }
  | {
      outcome: 'clarify';
      instruction: string;
      resolvedSubject: AssistantActiveBuffer | null;
      routing: AssistantTurnRouting | null;
      reusePreviousRetrievals: boolean;
    }
  | {
      outcome: 'retrieve';
      instruction: string;
      resolvedSubject: AssistantActiveBuffer;
      requests: AssistantAskRetrievalRequest[];
      routing: AssistantTurnRouting | null;
      reusePreviousRetrievals: boolean;
    };

export type AssistantAskPlanInput = {
  prompt: string;
  queryBuffers: AssistantActiveBuffer[];
  rememberedSubject?: AssistantActiveBuffer | null;
  pendingClarification?: AssistantAskClarification | null;
  previousRetrievals?: AssistantAskRetrievalMemory[];
  selectedBuffer?: AssistantActiveBuffer | null;
};

export type PlanPromptInput = {
  prompt: string;
  normalizedPrompt: string;
  queryBuffers: AssistantActiveBuffer[];
  rememberedSubject: AssistantActiveBuffer | null;
  previousRetrievals: AssistantAskRetrievalMemory[];
  selectedBuffer: AssistantActiveBuffer | null;
  selectedBufferConfirmed: boolean;
  forcedSubject?: AssistantActiveBuffer | null;
};

export type ResolvePendingClarificationInput = {
  prompt: string;
  normalizedPrompt: string;
  queryBuffers: AssistantActiveBuffer[];
  rememberedSubject: AssistantActiveBuffer | null;
  pendingClarification: AssistantAskClarification | null;
  previousRetrievals: AssistantAskRetrievalMemory[];
  selectedBuffer: AssistantActiveBuffer | null;
};

export type AskPromptAnalysis = {
  generalSubjectChat: boolean;
  retrievalMode: 'none' | 'opening' | 'recent' | 'fact';
  factIntent: AssistantProfileFactIntent | null;
  reusePreviousRetrievals: boolean;
  requests: AssistantAskRetrievalRequest[];
  wantsTranscriptFacts: boolean;
};

export type PlanPromptResolver = (input: PlanPromptInput) => AssistantAskPlan;
