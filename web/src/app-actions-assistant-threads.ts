import type { AssistantTaskKind } from '../../shared/protocol.js';
import { api } from './client.js';
import {
  isDraftTargetAvailable,
  type AssistantActionContextShared,
  upsertThreadSummary,
} from './app-actions-assistant-shared.js';

export const createAssistantThreadActions = (
  context: AssistantActionContextShared,
) => ({
  loadAssistantThread: async (threadId: string) => {
    context.dispatch({ type: 'set-assistant-loading-thread', threadId });
    try {
      const result = await api.loadAssistantThread(threadId);
      context.dispatch({ type: 'assistant-thread-loaded', thread: result.thread });
      return result.thread;
    } catch (error) {
      context.updateBanner(
        'error',
        error instanceof Error ? error.message : 'Failed to load assistant thread',
      );
      return null;
    } finally {
      context.dispatch({ type: 'set-assistant-loading-thread', threadId: null });
    }
  },
  setAssistantActiveThread: async (threadId: string | null) => {
    context.dispatch({ type: 'select-assistant-thread', threadId });
    return context.executeMutation({
      request: () => api.saveAssistantPreferences({ activeThreadId: threadId }),
      failureValue: null,
      mapResult: () => threadId,
      onSuccess: ({ preferences }) => {
        context.syncSnapshot({ activeThreadId: preferences.activeThreadId });
      },
      successMessage: null,
      errorMessage: 'Failed to update assistant selection',
    });
  },
  createAssistantThread: async (task: AssistantTaskKind, model?: string) => {
    const session = context.getSession();
    if (task === 'draft' && !isDraftTargetAvailable(session)) {
      context.updateBanner(
        'error',
        'Select a channel or private message before creating a draft thread',
      );
      return null;
    }
    if (task === 'ask' && !session.workspace.selectedBuffer) {
      context.updateBanner(
        'error',
        'Select a channel or private message before starting an assistant chat',
      );
      return null;
    }
    const bufferId = session.workspace.selectedBuffer?.id ?? null;
    return context.executeMutation({
      request: () => api.createAssistantThread({ bufferId, task, model }),
      failureValue: null,
      mapResult: ({ thread: nextThread }) => nextThread,
      onSuccess: ({ thread: nextThread }) => {
        context.syncSnapshot({
          activeThreadId: nextThread.id,
          threads: upsertThreadSummary(
            context.getSession().state.domain.assistant.threads,
            nextThread,
          ),
        });
        context.dispatch({ type: 'select-assistant-thread', threadId: nextThread.id });
        context.dispatch({
          type: 'assistant-thread-loaded',
          thread: { ...nextThread, turns: [] },
        });
      },
      successMessage: null,
      errorMessage: 'Failed to create assistant thread',
    });
  },
  clearAssistantThreads: async (threadIds: string[]) => {
    if (threadIds.length === 0) {
      return true;
    }
    for (const threadId of threadIds) {
      try {
        const result = await api.deleteAssistantThread(threadId);
        context.applyServerMessages(result.messages);
        context.dispatch({ type: 'assistant-thread-removed', threadId });
      } catch (error) {
        context.updateBanner(
          'error',
          error instanceof Error ? error.message : 'Failed to clear assistant history',
        );
        return false;
      }
    }
    return true;
  },
});
