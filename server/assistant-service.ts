import type {
  AssistantModel,
  AssistantRateLimits,
  AssistantSnapshot,
  AssistantTaskKind,
  AssistantThread,
  AssistantThreadScope,
  AssistantTurnAttachmentInput,
  ServerMessage,
} from '../shared/protocol.js';
import { curatedAssistantModels, defaultAssistantModel } from '../shared/assistant-defaults.js';
import { AssistantAppServer } from './assistant-app-server.js';
import { buildAssistantThreadTitle } from './assistant-prompts.js';
import type {
  RuntimeAssistantStore,
  RuntimeConversationStore,
  RuntimeNetworkStore,
} from './runtime-store-ports.js';
import { randomUUID } from 'node:crypto';
import { badRequest } from './app-error.js';
import { AssistantServiceRuntime } from './assistant-service-runtime.js';
import {
  localAssistantThreadIdPrefix,
  type LoginResponse,
  type RawAccount,
  type RawModel,
  type RawRateLimitReadResponse,
  type RawRateLimits,
  type RawThreadItem,
  type RawTurn,
  mergeRateLimitBuckets,
  toRateLimitBuckets,
  toRateLimits,
} from './assistant-service-shared.js';

type AssistantServiceParams = {
  assistant: RuntimeAssistantStore;
  conversations: RuntimeConversationStore;
  networks: RuntimeNetworkStore;
  publish: (message: ServerMessage | readonly ServerMessage[]) => void;
  autoStart?: boolean;
};

export class AssistantService {
  private readonly appServer: AssistantAppServer;
  private readonly runtime: AssistantServiceRuntime;
  private serviceStatus: AssistantSnapshot['serviceStatus'] = 'starting';
  private serviceError: string | null = null;
  private auth: AssistantSnapshot['auth'] = {
    requiresOpenaiAuth: true,
    account: null,
    pendingLoginId: null,
    pendingAuthUrl: null,
    lastError: null,
  };
  private rateLimits: AssistantRateLimits | null = null;
  private rateLimitBuckets: AssistantRateLimits[] = [];
  private models: AssistantModel[] = [];

  constructor(private readonly params: AssistantServiceParams) {
    this.appServer = new AssistantAppServer('0.1.0', params.autoStart ?? true);
    this.runtime = new AssistantServiceRuntime({
      assistant: params.assistant,
      conversations: params.conversations,
      networks: params.networks,
      callAppServer: (method, callParams) => this.appServer.call(method, callParams),
      publish: (message) => this.publish(message),
      runAppServerTask: (task) => this.runAppServerTask(task),
      snapshot: () => this.snapshot(),
    });
    this.appServer.on('ready', () => {
      this.runAppServerTask(() => this.handleReady());
    });
    this.appServer.on('unavailable', (error) => {
      this.handleUnavailable(error);
    });
    this.appServer.on('notification', (message) => {
      this.runAppServerTask(() => this.handleNotification(message.method, message.params));
    });
    this.runtime.reconcilePersistedInProgressThreads();
  }

  close() {
    this.appServer.close();
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
    const response = await this.appServer.call<LoginResponse>('account/login/start', { type: 'chatgpt' });
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
    await this.appServer.call('account/login/cancel', { loginId });
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
    await this.appServer.call('account/logout');
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

  async createThread(input: {
    bufferId: string | null;
    scope?: AssistantThreadScope;
    task: AssistantTaskKind;
    model?: string;
  }) {
    const model = this.sanitizeModel(input.model);
    const scope = this.resolveAssistantThreadScope(input.task, input.scope);
    const buffer = scope === 'buffer' && input.bufferId ? this.params.conversations.getBuffer(input.bufferId) : null;
    if (scope === 'buffer' && !buffer) {
      throw badRequest('Select a buffer before starting a buffer-scoped assistant thread');
    }
    const target = scope === 'buffer' ? buffer?.target ?? null : null;
    const threadId = `${localAssistantThreadIdPrefix}${randomUUID()}`;
    const summary = this.params.assistant.upsertThread({
      id: threadId,
      bufferId: scope === 'buffer' ? buffer?.id ?? null : null,
      networkId: scope === 'buffer' ? buffer?.networkId ?? null : null,
      scope,
      target,
      title: buildAssistantThreadTitle(input.task, target, scope),
      task: input.task,
      model,
      turnStatus: null,
    });
    const preferences = this.params.assistant.getPreferences();
    this.params.assistant.savePreferences({
      ...preferences,
      activeThreadId: threadId,
    });
    this.publishSnapshot();
    if (!summary) {
      throw new Error('Failed to create assistant thread');
    }
    return summary;
  }

  async readThread(threadId: string): Promise<AssistantThread> {
    return this.runtime.readThread(this.requireThread(threadId));
  }

  async deleteThread(threadId: string) {
    const summary = this.requireThread(threadId);
    await this.runtime.interruptThread(summary.id);
    this.runtime.clearThreadState(summary.id);
    this.params.assistant.removeThread(summary.id);
    return {
      messages: [
        {
          type: 'assistant.snapshot' as const,
          assistant: this.snapshot(),
        },
      ],
    };
  }

  async startTurn(input: {
    activeBufferId?: string | null;
    attachments?: AssistantTurnAttachmentInput[];
    clientTurnId?: string;
    threadId: string;
    prompt: string;
  }) {
    return this.runtime.startExecution(input);
  }

  async interruptThread(threadId: string) {
    this.requireThread(threadId);
    await this.runtime.interruptThread(threadId);
  }

  async interruptTurn(threadId: string, turnId: string) {
    await this.runtime.interruptTurn(threadId, turnId);
  }

  updatePreferences(input: {
    defaultModel?: string;
    activeThreadId?: string | null;
  }) {
    const current = this.params.assistant.getPreferences();
    const next = this.params.assistant.savePreferences({
      defaultModel: this.sanitizeModel(input.defaultModel ?? current.defaultModel),
      activeThreadId: input.activeThreadId === undefined ? current.activeThreadId : input.activeThreadId,
    });
    this.publishSnapshot();
    return next;
  }

  private resolveAssistantThreadScope(
    task: AssistantTaskKind,
    scope: AssistantThreadScope | undefined,
  ): AssistantThreadScope {
    if (task !== 'ask') {
      return 'buffer';
    }
    return scope ?? 'free';
  }

  private async handleReady() {
    this.serviceStatus = 'ready';
    this.serviceError = null;
    await Promise.all([
      this.refreshAccount(),
      this.refreshRateLimits(),
      this.refreshModels(),
    ]);
    this.publishSnapshot();
  }

  private runAppServerTask(task: () => Promise<void>) {
    void task().catch((error) => {
      this.serviceStatus = 'error';
      this.serviceError = error instanceof Error ? error.message : String(error);
      this.publishSnapshot();
    });
  }

  private handleUnavailable(error: Error | null) {
    const failedMessages = this.runtime.failInProgressTurns(error);
    this.runtime.resetTransientState();
    this.serviceStatus = error ? 'error' : 'starting';
    this.serviceError = error?.message ?? null;
    this.clearPendingLogin();
    if (failedMessages.length === 0) {
      this.publishSnapshot();
      return;
    }
    this.publish([
      ...failedMessages,
      {
        type: 'assistant.snapshot',
        assistant: this.snapshot(),
      },
    ]);
  }

  private async handleNotification(method: string, params: unknown) {
    switch (method) {
      case 'account/updated':
        await this.refreshAccount();
        this.publishSnapshot();
        return;
      case 'account/rateLimits/updated':
        this.rateLimits = toRateLimits(
          (params as { rateLimits: RawRateLimits }).rateLimits,
          this.rateLimits,
        );
        this.rateLimitBuckets = mergeRateLimitBuckets(
          this.rateLimitBuckets,
          this.rateLimits,
        );
        this.publishSnapshot();
        return;
      case 'account/login/completed':
        await this.handleLoginCompleted(params as {
          loginId?: string;
          success: boolean;
          error?: string | null;
        });
        return;
      case 'turn/started':
        this.runtime.handleTurnStarted(params as { threadId: string; turn: RawTurn });
        return;
      case 'turn/completed':
        await this.runtime.handleTurnCompleted(params as { threadId: string; turn: RawTurn });
        return;
      case 'item/started':
        this.runtime.handleItemStarted(params as { threadId: string; turnId: string; item: RawThreadItem });
        return;
      case 'item/agentMessage/delta':
        this.runtime.handleItemDelta(params as { threadId: string; turnId: string; itemId: string; delta: string });
        return;
      case 'item/completed':
        this.runtime.handleItemCompleted(params as { threadId: string; turnId: string; item: RawThreadItem });
        return;
      default:
        return;
    }
  }

  private async handleLoginCompleted(params: {
    loginId?: string;
    success: boolean;
    error?: string | null;
  }) {
    const shouldClearPending = !params.loginId || !this.auth.pendingLoginId || params.loginId === this.auth.pendingLoginId;
    if (shouldClearPending) {
      this.clearPendingLogin(params.success ? null : params.error ?? 'OpenAI authentication failed');
    }
    await Promise.all([
      this.refreshAccount(),
      this.refreshRateLimits(),
      this.refreshModels(),
    ]);
    this.publishSnapshot();
  }

  private handleTurnStarted(params: { threadId: string; turn: RawTurn }) {
    this.runtime.handleTurnStarted(params);
  }

  private async handleTurnCompleted(params: { threadId: string; turn: RawTurn }) {
    await this.runtime.handleTurnCompleted(params);
  }

  private handleItemStarted(params: { threadId: string; turnId: string; item: RawThreadItem }) {
    this.runtime.handleItemStarted(params);
  }

  private handleItemDelta(params: { threadId: string; turnId: string; itemId: string; delta: string }) {
    this.runtime.handleItemDelta(params);
  }

  private handleItemCompleted(params: { threadId: string; turnId: string; item: RawThreadItem }) {
    this.runtime.handleItemCompleted(params);
  }

  private async refreshAccount() {
    const response = await this.appServer.call<{ requiresOpenaiAuth: boolean; account: RawAccount | null }>('account/read', {
      refreshToken: false,
    });
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

  private clearPendingLogin(lastError: string | null = this.auth.lastError) {
    this.auth = {
      ...this.auth,
      pendingLoginId: null,
      pendingAuthUrl: null,
      lastError,
    };
  }

  private async refreshRateLimits() {
    try {
      const response = await this.appServer.call<RawRateLimitReadResponse>('account/rateLimits/read');
      this.rateLimits = toRateLimits(response.rateLimits);
      this.rateLimitBuckets = toRateLimitBuckets(response);
    } catch {
      this.rateLimits = null;
      this.rateLimitBuckets = [];
    }
  }

  private async refreshModels() {
    try {
      const response = await this.appServer.call<{ data: RawModel[] }>('model/list', {
        limit: 50,
        includeHidden: false,
      });
      const curatedIds = new Set(curatedAssistantModels);
      const filtered = response.data.filter((model) => curatedIds.has(model.id as typeof curatedAssistantModels[number]));
      this.models = (filtered.length > 0 ? filtered : response.data).map((model) => ({
        id: model.id,
        displayName: model.displayName,
        description: model.description,
        isDefault: model.isDefault,
        hidden: model.hidden,
      }));
      const preferences = this.params.assistant.getPreferences();
      if (this.models.length > 0 && !this.models.some((model) => model.id === preferences.defaultModel)) {
        this.params.assistant.savePreferences({
          ...preferences,
          defaultModel: this.models[0]!.id,
        });
      }
    } catch {
      this.models = [];
    }
  }

  private sanitizeModel(model: string | undefined) {
    const current = model ?? this.params.assistant.getPreferences().defaultModel;
    const available = this.models.map((entry) => entry.id);
    if (available.includes(current)) {
      return current;
    }
    if (curatedAssistantModels.includes(current as typeof curatedAssistantModels[number])) {
      return current;
    }
    return available[0] ?? defaultAssistantModel;
  }

  private requireThread(threadId: string) {
    const thread = this.params.assistant.getThread(threadId);
    if (!thread) {
      throw new Error(`Unknown assistant thread: ${threadId}`);
    }
    return thread;
  }

  private publishSnapshot() {
    this.publish({
      type: 'assistant.snapshot',
      assistant: this.snapshot(),
    });
  }

  private publish(message: ServerMessage | readonly ServerMessage[]) {
    this.params.publish(message);
  }
}
