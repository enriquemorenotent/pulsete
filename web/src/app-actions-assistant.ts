import type { AssistantSnapshot, AssistantTaskKind, AssistantThreadSummary } from '../../shared/protocol.js';
import type { AppActionContext } from './app-actions-types.js';
import { createAppMutationExecutor } from './app-mutation.js';
import { api } from './client.js';

type AssistantActionParams = Pick<
  AppActionContext,
  'applyServerMessages' | 'dispatch' | 'getSession' | 'setDraft' | 'updateBanner'
>;

const isDraftTargetAvailable = (session: ReturnType<AssistantActionParams['getSession']>) =>
  session.workspace.composerMode === 'normal' && session.workspace.selectedBuffer?.kind !== 'server';

const patchAssistantSnapshot = (
  current: AssistantSnapshot,
  patch: Partial<AssistantSnapshot>
): AssistantSnapshot => ({
  ...current,
  ...patch,
});

const upsertThreadSummary = (
  threads: AssistantThreadSummary[],
  nextThread: AssistantThreadSummary
) => [...threads.filter((thread) => thread.id !== nextThread.id), nextThread]
  .sort((left, right) => right.updatedAt - left.updatedAt);

type AuthPopup = Window | null;

const openPendingAuthPopup = (): AuthPopup => {
  try {
    const popup = window.open('about:blank', '_blank');
    if (!popup) {
      return null;
    }
    try {
      popup.opener = null;
      popup.document.title = 'Connecting to ChatGPT…';
    } catch {
      // Ignore same-origin access failures on placeholder setup.
    }
    return popup;
  } catch {
    return null;
  }
};

const navigatePendingAuthPopup = (
  popup: AuthPopup,
  authUrl: string,
  updateBanner: AssistantActionParams['updateBanner']
) => {
  if (popup && !popup.closed) {
    try {
      popup.location.replace(authUrl);
      popup.focus();
      return;
    } catch {
      closePendingAuthPopup(popup);
    }
  }
  updateBanner('notice', 'Use the sign-in link in Preferences to continue the ChatGPT login flow.');
};

const closePendingAuthPopup = (popup: AuthPopup) => {
  if (!popup) {
    return;
  }
  try {
    popup.close();
  } catch {
    // Ignore browser close failures; the popup is only a best-effort helper.
  }
};

export const createAssistantActions = ({
  applyServerMessages,
  dispatch,
  getSession,
  setDraft,
  updateBanner,
}: AssistantActionParams) => {
  const executeMutation = createAppMutationExecutor({ applyServerMessages, updateBanner });

  const syncSnapshot = (patch: Partial<AssistantSnapshot>) => {
    const { state } = getSession();
    dispatch({
      type: 'assistant-snapshot',
      assistant: patchAssistantSnapshot(state.domain.assistant, patch),
    });
  };

  const loadAssistantThread = async (threadId: string) => {
    dispatch({ type: 'set-assistant-loading-thread', threadId });
    try {
      const result = await api.loadAssistantThread(threadId);
      dispatch({ type: 'assistant-thread-loaded', thread: result.thread });
      return result.thread;
    } catch (error) {
      updateBanner('error', error instanceof Error ? error.message : 'Failed to load assistant thread');
      return null;
    } finally {
      dispatch({ type: 'set-assistant-loading-thread', threadId: null });
    }
  };

  const setAssistantActiveThread = async (threadId: string | null) => {
    dispatch({ type: 'select-assistant-thread', threadId });
    const result = await executeMutation({
      request: () => api.saveAssistantPreferences({ activeThreadId: threadId }),
      failureValue: null,
      mapResult: () => threadId,
      onSuccess: ({ preferences }) => {
        syncSnapshot({ activeThreadId: preferences.activeThreadId });
      },
      successMessage: null,
      errorMessage: 'Failed to update assistant selection',
    });
    return result;
  };

  const startAssistantChatgptLogin = async () => {
    const popup = openPendingAuthPopup();
    const result = await executeMutation({
      request: () => api.startAssistantChatgptLogin(),
      failureValue: false,
      mapResult: () => true,
      onSuccess: (result) => {
        syncSnapshot({
          auth: {
            ...getSession().state.domain.assistant.auth,
            pendingLoginId: result.loginId,
            pendingAuthUrl: result.authUrl,
            lastError: null,
          },
        });
        navigatePendingAuthPopup(popup, result.authUrl, updateBanner);
      },
      successMessage: null,
      errorMessage: 'Failed to start OpenAI sign-in',
    });
    if (!result) {
      closePendingAuthPopup(popup);
    }
    return result;
  };

  const cancelAssistantLogin = async (loginId: string) =>
    executeMutation({
      request: () => api.cancelAssistantLogin(loginId),
      failureValue: false,
      mapResult: () => true,
      onSuccess: () => {
        syncSnapshot({
          auth: {
            ...getSession().state.domain.assistant.auth,
            pendingLoginId: null,
            pendingAuthUrl: null,
          },
        });
      },
      successMessage: null,
      errorMessage: 'Failed to cancel OpenAI sign-in',
    });

  const logoutAssistant = async () =>
    executeMutation({
      request: () => api.logoutAssistant(),
      failureValue: false,
      mapResult: () => true,
      onSuccess: () => {
        const { state } = getSession();
        syncSnapshot({
          auth: {
            ...state.domain.assistant.auth,
            account: null,
            pendingLoginId: null,
            pendingAuthUrl: null,
            lastError: null,
          },
          rateLimits: null,
          rateLimitBuckets: [],
        });
      },
      successMessage: null,
      errorMessage: 'Failed to sign out of OpenAI',
    });

  const updateAssistantDefaultModel = async (defaultModel: string) =>
    executeMutation({
      request: () => api.saveAssistantPreferences({ defaultModel }),
      failureValue: null,
      mapResult: ({ preferences }) => preferences,
      onSuccess: ({ preferences }) => {
        syncSnapshot({ defaultModel: preferences.defaultModel });
      },
      successMessage: null,
      errorMessage: 'Failed to update assistant model',
    });

  const createAssistantThread = async (task: AssistantTaskKind, model?: string) => {
    const session = getSession();
    if (task === 'draft' && !isDraftTargetAvailable(session)) {
      updateBanner('error', 'Select a channel or private message before creating a draft thread');
      return null;
    }
    const bufferId = session.workspace.selectedBuffer?.id ?? null;
    const thread = await executeMutation({
      request: () => api.createAssistantThread({ bufferId, task, model }),
      failureValue: null,
      mapResult: ({ thread: nextThread }) => nextThread,
      onSuccess: ({ thread: nextThread }) => {
        syncSnapshot({
          activeThreadId: nextThread.id,
          threads: upsertThreadSummary(getSession().state.domain.assistant.threads, nextThread),
        });
        dispatch({ type: 'select-assistant-thread', threadId: nextThread.id });
        dispatch({
          type: 'assistant-thread-loaded',
          thread: {
            ...nextThread,
            turns: [],
          },
        });
      },
      successMessage: null,
      errorMessage: 'Failed to create assistant thread',
    });
    return thread;
  };

  const startAssistantTurn = async (threadId: string, prompt: string) =>
    executeMutation({
      request: () => api.startAssistantTurn(threadId, { prompt }),
      failureValue: false,
      mapResult: () => true,
      successMessage: null,
      errorMessage: 'Failed to start assistant turn',
    });

  const interruptAssistantTurn = async (threadId: string, turnId: string) =>
    executeMutation({
      request: () => api.interruptAssistantTurn(threadId, turnId),
      failureValue: false,
      mapResult: () => true,
      successMessage: null,
      errorMessage: 'Failed to interrupt assistant turn',
    });

  const useAssistantDraft = (draft: string) => {
    setDraft(draft);
  };

  return {
    cancelAssistantLogin,
    createAssistantThread,
    interruptAssistantTurn,
    loadAssistantThread,
    logoutAssistant,
    setAssistantActiveThread,
    startAssistantChatgptLogin,
    startAssistantTurn,
    updateAssistantDefaultModel,
    useAssistantDraft,
  };
};

export type AssistantActionSet = ReturnType<typeof createAssistantActions>;
