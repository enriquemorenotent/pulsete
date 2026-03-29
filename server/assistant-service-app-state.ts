import type { AssistantModel, AssistantRateLimits, AssistantSnapshot } from '../shared/protocol.js';
import { curatedAssistantModels, defaultAssistantModel } from '../shared/assistant-defaults.js';
import type { RuntimeAssistantStore } from './runtime-store-ports.js';
import { type LoginResponse, type RawAccount, type RawModel, type RawRateLimitReadResponse, type RawRateLimits, mergeRateLimitBuckets, toRateLimitBuckets, toRateLimits } from './assistant-service-shared.js';

type AssistantServiceAppStateParams = {
  assistant: RuntimeAssistantStore;
  callAppServer: (method: string, params?: unknown) => Promise<unknown>;
  publishSnapshot: () => void;
};

export class AssistantServiceAppState {
  private serviceStatus: AssistantSnapshot['serviceStatus'] = 'starting';
  private serviceError: string | null = null;
  private auth: AssistantSnapshot['auth'] = { requiresOpenaiAuth: true, account: null, pendingLoginId: null, pendingAuthUrl: null, lastError: null };
  private rateLimits: AssistantRateLimits | null = null;
  private rateLimitBuckets: AssistantRateLimits[] = [];
  private models: AssistantModel[] = [];

  constructor(private readonly params: AssistantServiceAppStateParams) {}

  getAuth() {
    return this.auth;
  }

  setAuthForTesting(auth: AssistantSnapshot['auth']) {
    this.auth = auth;
  }

  snapshot(): AssistantSnapshot {
    const preferences = this.params.assistant.getPreferences();
    return {
      serviceStatus: this.serviceStatus,
      serviceError: this.serviceError,
      auth: this.auth,
      rateLimits: this.rateLimits,
      rateLimitBuckets: this.rateLimitBuckets,
      models: this.models,
      defaultModel: preferences.defaultModel,
      activeThreadId: preferences.activeThreadId,
      threads: this.params.assistant.listThreads(),
    };
  }

  async startChatgptLogin() {
    const response = await this.params.callAppServer(
      'account/login/start',
      { type: 'chatgpt' },
    ) as LoginResponse;
    this.auth = {
      ...this.auth,
      pendingLoginId: response.loginId,
      pendingAuthUrl: response.authUrl,
      lastError: null,
    };
    this.publishSnapshot();
    return response;
  }

  async cancelLogin(loginId: string) {
    await this.params.callAppServer('account/login/cancel', { loginId });
    if (this.auth.pendingLoginId === loginId) {
      this.auth = {
        ...this.auth,
        pendingLoginId: null,
        pendingAuthUrl: null,
      };
      this.publishSnapshot();
    }
  }

  async logout() {
    await this.params.callAppServer('account/logout');
    this.auth = {
      ...this.auth,
      account: null,
      pendingLoginId: null,
      pendingAuthUrl: null,
      lastError: null,
    };
    this.rateLimits = null;
    this.rateLimitBuckets = [];
    this.publishSnapshot();
  }

  updatePreferences(input: { defaultModel?: string; activeThreadId?: string | null }) {
    const current = this.params.assistant.getPreferences();
    const next = this.params.assistant.savePreferences({
      defaultModel: this.sanitizeModel(input.defaultModel ?? current.defaultModel),
      activeThreadId: input.activeThreadId === undefined ? current.activeThreadId : input.activeThreadId,
    });
    this.publishSnapshot();
    return next;
  }

  async handleReady() {
    this.serviceStatus = 'ready';
    this.serviceError = null;
    await Promise.all([this.refreshAccount(), this.refreshRateLimits(), this.refreshModels()]);
    this.publishSnapshot();
  }

  markTaskError(error: unknown) {
    this.serviceStatus = 'error';
    this.serviceError = error instanceof Error ? error.message : String(error);
    this.publishSnapshot();
  }

  handleUnavailable(error: Error | null) {
    this.serviceStatus = error ? 'error' : 'starting';
    this.serviceError = error?.message ?? null;
    this.clearPendingLogin();
  }

  async handleAccountUpdated() {
    await this.refreshAccount();
    this.publishSnapshot();
  }

  handleRateLimitsUpdated(rateLimits: RawRateLimits) {
    this.rateLimits = toRateLimits(rateLimits, this.rateLimits);
    this.rateLimitBuckets = mergeRateLimitBuckets(this.rateLimitBuckets, this.rateLimits);
    this.publishSnapshot();
  }

  async handleLoginCompleted(params: { loginId?: string; success: boolean; error?: string | null }) {
    const shouldClearPending =
      !params.loginId ||
      !this.auth.pendingLoginId ||
      params.loginId === this.auth.pendingLoginId;
    if (shouldClearPending) {
      this.clearPendingLogin(params.success ? null : params.error ?? 'OpenAI authentication failed');
    }
    await Promise.all([this.refreshAccount(), this.refreshRateLimits(), this.refreshModels()]);
    this.publishSnapshot();
  }

  sanitizeModel(model: string | undefined) {
    const current = model ?? this.params.assistant.getPreferences().defaultModel;
    const available = this.models.map((entry) => entry.id);
    if (available.includes(current)) {
      return current;
    }
    if (curatedAssistantModels.includes(current as (typeof curatedAssistantModels)[number])) {
      return current;
    }
    return available[0] ?? defaultAssistantModel;
  }

  private clearPendingLogin(lastError: string | null = this.auth.lastError) {
    this.auth = {
      ...this.auth,
      pendingLoginId: null,
      pendingAuthUrl: null,
      lastError,
    };
  }

  private async refreshAccount() {
    const response = await this.params.callAppServer('account/read', { refreshToken: false }) as { requiresOpenaiAuth: boolean; account: RawAccount | null };
    this.auth = {
      ...this.auth,
      requiresOpenaiAuth: response.requiresOpenaiAuth,
      account: response.account,
    };
    if (!response.account) {
      this.rateLimits = null;
      this.rateLimitBuckets = [];
    }
  }

  private async refreshRateLimits() {
    try {
      const response = await this.params.callAppServer('account/rateLimits/read') as RawRateLimitReadResponse;
      this.rateLimits = toRateLimits(response.rateLimits);
      this.rateLimitBuckets = toRateLimitBuckets(response);
    } catch {
      this.rateLimits = null;
      this.rateLimitBuckets = [];
    }
  }

  private async refreshModels() {
    try {
      const response = await this.params.callAppServer('model/list', { limit: 50, includeHidden: false }) as { data: RawModel[] };
      const curatedIds = new Set(curatedAssistantModels);
      const filtered = response.data.filter((model) => curatedIds.has(model.id as (typeof curatedAssistantModels)[number]));
      this.models = (filtered.length > 0 ? filtered : response.data).map((model) => ({
        id: model.id,
        displayName: model.displayName,
        description: model.description,
        isDefault: model.isDefault,
        hidden: model.hidden,
      }));
      const preferences = this.params.assistant.getPreferences();
      if (
        this.models.length > 0 &&
        !this.models.some((model) => model.id === preferences.defaultModel)
      ) {
        this.params.assistant.savePreferences({
          ...preferences,
          defaultModel: this.models[0]!.id,
        });
      }
    } catch {
      this.models = [];
    }
  }

  private publishSnapshot() {
    this.params.publishSnapshot();
  }
}
