import type { AssistantTurnAttachmentInput } from '../../shared/protocol.js';
import { api } from './client.js';
import {
  buildOptimisticAssistantTurn,
  createAssistantTurnId,
  markAssistantThreadStopped,
  type AssistantActionContextShared,
} from './app-actions-assistant-shared.js';

export const createAssistantTurnActions = (
  context: AssistantActionContextShared,
) => ({
  startAssistantTurn: async (
    threadId: string,
    prompt: string,
    attachments: AssistantTurnAttachmentInput[] = [],
    activeBufferId: string | null = null,
  ) => {
    const clientTurnId = createAssistantTurnId();
    const optimisticTurn = buildOptimisticAssistantTurn(
      clientTurnId,
      prompt,
      attachments,
    );
    context.dispatch({ type: 'assistant-turn-started', threadId, turn: optimisticTurn });
    void api.startAssistantTurn(threadId, {
      activeBufferId,
      clientTurnId,
      prompt,
      attachments,
    }).then((result) => {
      context.applyServerMessages(result.messages ?? []);
    }).catch((error) => {
      context.dispatch({
        type: 'assistant-turn-completed',
        threadId,
        turn: {
          ...optimisticTurn,
          status: 'failed',
          error: error instanceof Error ? error.message : 'Failed to start assistant turn',
        },
      });
      context.updateBanner(
        'error',
        error instanceof Error ? error.message : 'Failed to start assistant turn',
      );
    });
    return true;
  },
  interruptAssistantTurn: async (threadId: string, turnId: string) =>
    context.executeMutation({
      request: () => api.interruptAssistantTurn(threadId, turnId),
      failureValue: false,
      mapResult: () => true,
      onSuccess: () => {
        markAssistantThreadStopped(context.dispatch, threadId);
      },
      successMessage: null,
      errorMessage: 'Failed to interrupt assistant turn',
    }),
  interruptAssistantThread: async (threadId: string) =>
    context.executeMutation({
      request: () => api.interruptAssistantThread(threadId),
      failureValue: false,
      mapResult: () => true,
      onSuccess: () => {
        markAssistantThreadStopped(context.dispatch, threadId);
      },
      successMessage: null,
      errorMessage: 'Failed to stop assistant turn',
    }),
  useAssistantDraft: (draft: string) => {
    context.setDraft(draft);
  },
});
