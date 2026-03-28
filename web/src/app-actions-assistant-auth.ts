import { api } from './client.js';
import type { AssistantActionContextShared } from './app-actions-assistant-shared.js';

type AuthPopup = Window | null;

export const createAssistantAuthActions = (
  context: AssistantActionContextShared,
) => ({
  startAssistantChatgptLogin: async () => {
    const popup = openPendingAuthPopup();
    const result = await context.executeMutation({
      request: () => api.startAssistantChatgptLogin(),
      failureValue: false,
      mapResult: () => true,
      onSuccess: (result) => {
        context.syncSnapshot({
          auth: {
            ...context.getSession().state.domain.assistant.auth,
            pendingLoginId: result.loginId,
            pendingAuthUrl: result.authUrl,
            lastError: null,
          },
        });
        navigatePendingAuthPopup(popup, result.authUrl, context.updateBanner);
      },
      successMessage: null,
      errorMessage: 'Failed to start OpenAI sign-in',
    });
    if (!result) {
      closePendingAuthPopup(popup);
    }
    return result;
  },
  cancelAssistantLogin: async (loginId: string) =>
    context.executeMutation({
      request: () => api.cancelAssistantLogin(loginId),
      failureValue: false,
      mapResult: () => true,
      onSuccess: () => {
        context.syncSnapshot({
          auth: {
            ...context.getSession().state.domain.assistant.auth,
            pendingLoginId: null,
            pendingAuthUrl: null,
          },
        });
      },
      successMessage: null,
      errorMessage: 'Failed to cancel OpenAI sign-in',
    }),
  logoutAssistant: async () =>
    context.executeMutation({
      request: () => api.logoutAssistant(),
      failureValue: false,
      mapResult: () => true,
      onSuccess: () => {
        const { state } = context.getSession();
        context.syncSnapshot({
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
    }),
  updateAssistantDefaultModel: async (defaultModel: string) =>
    context.executeMutation({
      request: () => api.saveAssistantPreferences({ defaultModel }),
      failureValue: null,
      mapResult: ({ preferences }) => preferences,
      onSuccess: ({ preferences }) => {
        context.syncSnapshot({ defaultModel: preferences.defaultModel });
      },
      successMessage: null,
      errorMessage: 'Failed to update assistant model',
    }),
});

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
      // Ignore same-origin placeholder setup failures.
    }
    return popup;
  } catch {
    return null;
  }
};

const navigatePendingAuthPopup = (
  popup: AuthPopup,
  authUrl: string,
  updateBanner: AssistantActionContextShared['updateBanner'],
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
  updateBanner(
    'notice',
    'Use the sign-in link in Preferences to continue the ChatGPT login flow.',
  );
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
