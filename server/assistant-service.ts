import type {
  AssistantAccount,
  AssistantArtifact,
  AssistantItem,
  AssistantModel,
  AssistantRateLimits,
  AssistantSnapshot,
  AssistantTaskKind,
  AssistantThread,
  AssistantThreadSummary,
  AssistantTurn,
  AssistantTurnStatus,
  BufferState,
  NetworkProfile,
  ServerMessage,
} from '../shared/protocol.js';
import { curatedAssistantModels, defaultAssistantModel } from '../shared/assistant-defaults.js';
import { AssistantAppServer } from './assistant-app-server.js';
import {
  assistantBaseInstructions,
  buildAssistantThreadTitle,
  buildAssistantTurnInput,
  extractAssistantUserPrompt,
  getAssistantOutputSchema,
  parseAssistantArtifact,
} from './assistant-prompts.js';
import type {
  RuntimeAssistantStore,
  RuntimeConversationStore,
  RuntimeNetworkStore,
} from './runtime-store-ports.js';
import { tmpdir } from 'node:os';

const contextMessageLimit = 50;
const assistantSandboxCwd = tmpdir();
const assistantThreadSandbox = 'readOnly';
const assistantTurnSandboxPolicy = {
  type: 'readOnly',
  access: {
    type: 'restricted',
    includePlatformDefaults: false,
    readableRoots: [],
  },
  networkAccess: false,
} as const;

type AssistantServiceParams = {
  assistant: RuntimeAssistantStore;
  conversations: RuntimeConversationStore;
  networks: RuntimeNetworkStore;
  publish: (message: ServerMessage | readonly ServerMessage[]) => void;
  autoStart?: boolean;
};

type RawAccount =
  | { type: 'apiKey' }
  | { type: 'chatgpt'; email: string; planType: AssistantAccount extends { type: 'chatgpt'; planType: infer T } ? T : never };

type RawRateLimits = {
  limitId: string | null;
  limitName?: string | null;
  primary?: { usedPercent: number; windowDurationMins: number | null; resetsAt: number | null } | null;
  secondary?: { usedPercent: number; windowDurationMins: number | null; resetsAt: number | null } | null;
  credits?: { hasCredits: boolean; unlimited: boolean; balance: string | null } | null;
  planType?: AssistantRateLimits['planType'];
};

type RawRateLimitReadResponse = {
  rateLimits: RawRateLimits;
  rateLimitsByLimitId?: Record<string, RawRateLimits>;
};

type RawModel = {
  id: string;
  displayName: string;
  description: string;
  isDefault: boolean;
  hidden: boolean;
};

type RawThreadStartResponse = {
  thread: {
    id: string;
  };
};

type RawThreadReadResponse = {
  thread: {
    id: string;
    turns: RawTurn[];
  };
};

type RawTurn = {
  id: string;
  status: string;
  error: unknown;
  items: RawThreadItem[];
};

type RawThreadItem =
  | { type: 'userMessage'; id: string; content: Array<{ type: string; text?: string }> }
  | { type: 'agentMessage'; id: string; text: string; phase: string | null }
  | { type: 'plan'; id: string; text: string }
  | { type: 'reasoning'; id: string; summary: string[]; content: string[] }
  | { type: string; id: string; [key: string]: unknown };

type LoginResponse = {
  type: 'chatgpt';
  loginId: string;
  authUrl: string;
};

type LiveTurnState = {
  threadId: string;
  turn: AssistantTurn;
};

export class AssistantService {
  private readonly appServer: AssistantAppServer;
  private readonly loadedThreads = new Set<string>();
  private readonly liveTurns = new Map<string, LiveTurnState>();
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
    this.appServer.on('ready', () => {
      this.runAppServerTask(() => this.handleReady());
    });
    this.appServer.on('unavailable', (error) => {
      this.handleUnavailable(error);
    });
    this.appServer.on('notification', (message) => {
      this.runAppServerTask(() => this.handleNotification(message.method, message.params));
    });
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
    task: AssistantTaskKind;
    model?: string;
  }) {
    const model = this.sanitizeModel(input.model);
    const buffer = input.bufferId ? this.params.conversations.getBuffer(input.bufferId) : null;
    const target = buffer?.target ?? null;
    const threadResponse = await this.appServer.call<RawThreadStartResponse>('thread/start', this.buildThreadStartParams(model));
    this.loadedThreads.add(threadResponse.thread.id);
    const summary = this.params.assistant.upsertThread({
      id: threadResponse.thread.id,
      bufferId: buffer?.id ?? null,
      networkId: buffer?.networkId ?? null,
      target,
      title: buildAssistantThreadTitle(input.task, target),
      task: input.task,
      model,
      turnStatus: null,
    });
    const preferences = this.params.assistant.getPreferences();
    this.params.assistant.savePreferences({
      ...preferences,
      activeThreadId: threadResponse.thread.id,
    });
    this.publishSnapshot();
    if (!summary) {
      throw new Error('Failed to create assistant thread');
    }
    return summary;
  }

  async readThread(threadId: string): Promise<AssistantThread> {
    const summary = this.requireThread(threadId);
    const response = await this.appServer.call<RawThreadReadResponse>('thread/read', {
      threadId,
      includeTurns: true,
    });
    const turns = Array.isArray(response.thread?.turns) ? response.thread.turns : [];
    return {
      ...summary,
      turns: turns.map((turn) => this.mapTurn(summary.task, turn)),
    };
  }

  async startTurn(input: {
    threadId: string;
    prompt: string;
  }) {
    const summary = this.requireThread(input.threadId);
    await this.ensureThreadLoaded(summary);
    const context = this.resolveContext(summary.bufferId, summary.networkId, summary.target);
    this.params.assistant.upsertThread({
      ...summary,
      turnStatus: 'inProgress',
      updatedAt: Date.now(),
    });
    this.publishSnapshot();
    try {
      await this.appServer.call('turn/start', {
        threadId: summary.id,
        input: [{
          type: 'text',
          text: buildAssistantTurnInput({
            buffer: context.buffer,
            network: context.network,
            messages: context.messages,
            prompt: input.prompt,
            task: summary.task,
          }),
        }],
        cwd: assistantSandboxCwd,
        approvalPolicy: 'never',
        sandboxPolicy: assistantTurnSandboxPolicy,
        model: summary.model,
        personality: 'pragmatic',
        outputSchema: getAssistantOutputSchema(summary.task),
      });
    } catch (error) {
      this.params.assistant.upsertThread(summary);
      this.publishSnapshot();
      throw error;
    }
  }

  async interruptTurn(threadId: string, turnId: string) {
    await this.appServer.call('turn/interrupt', { threadId, turnId });
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
    const failedMessages = this.failInProgressTurns(error);
    this.loadedThreads.clear();
    this.liveTurns.clear();
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
        this.handleTurnStarted(params as { threadId: string; turn: RawTurn });
        return;
      case 'turn/completed':
        this.handleTurnCompleted(params as { threadId: string; turn: RawTurn });
        return;
      case 'item/started':
        this.handleItemStarted(params as { threadId: string; turnId: string; item: RawThreadItem });
        return;
      case 'item/agentMessage/delta':
        this.handleItemDelta(params as { threadId: string; turnId: string; itemId: string; delta: string });
        return;
      case 'item/completed':
        this.handleItemCompleted(params as { threadId: string; turnId: string; item: RawThreadItem });
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
    const summary = this.requireThread(params.threadId);
    const turn = this.mapTurn(summary.task, params.turn);
    this.liveTurns.set(turn.id, { threadId: params.threadId, turn });
    this.publish({
      type: 'assistant.turn.started',
      threadId: params.threadId,
      turn,
    });
  }

  private handleTurnCompleted(params: { threadId: string; turn: RawTurn }) {
    const summary = this.requireThread(params.threadId);
    const live = this.liveTurns.get(params.turn.id);
    const next = live
      ? {
          ...live.turn,
          status: toTurnStatus(params.turn.status),
          error: toTurnError(params.turn.error),
        }
      : this.mapTurn(summary.task, params.turn);
    this.liveTurns.delete(params.turn.id);
    this.params.assistant.upsertThread({
      ...summary,
      turnStatus: next.status,
      updatedAt: Date.now(),
    });
    this.publish([
      {
        type: 'assistant.turn.completed',
        threadId: params.threadId,
        turn: next,
      },
      {
        type: 'assistant.snapshot',
        assistant: this.snapshot(),
      },
    ]);
  }

  private handleItemStarted(params: { threadId: string; turnId: string; item: RawThreadItem }) {
    const summary = this.requireThread(params.threadId);
    const live = this.liveTurns.get(params.turnId) ?? {
      threadId: params.threadId,
      turn: {
        id: params.turnId,
        status: 'inProgress' as const,
        error: null,
        items: [],
      },
    };
    const item = this.mapItem(summary.task, params.item);
    live.turn.items = upsertTurnItem(live.turn.items, item);
    this.liveTurns.set(params.turnId, live);
    this.publish({
      type: 'assistant.item.started',
      threadId: params.threadId,
      turnId: params.turnId,
      item,
    });
  }

  private handleItemDelta(params: { threadId: string; turnId: string; itemId: string; delta: string }) {
    const live = this.liveTurns.get(params.turnId);
    if (!live) {
      return;
    }
    live.turn.items = live.turn.items.map((item) =>
      item.id === params.itemId && item.type === 'agentMessage'
        ? { ...item, text: item.text + params.delta }
        : item
    );
    this.publish({
      type: 'assistant.item.delta',
      threadId: params.threadId,
      turnId: params.turnId,
      itemId: params.itemId,
      delta: params.delta,
    });
  }

  private handleItemCompleted(params: { threadId: string; turnId: string; item: RawThreadItem }) {
    const summary = this.requireThread(params.threadId);
    const live = this.liveTurns.get(params.turnId);
    if (!live) {
      return;
    }
    const item = this.mapItem(summary.task, params.item);
    live.turn.items = upsertTurnItem(live.turn.items, item);
    this.publish({
      type: 'assistant.item.completed',
      threadId: params.threadId,
      turnId: params.turnId,
      item,
    });
  }

  private async ensureThreadLoaded(summary: AssistantThreadSummary) {
    if (this.loadedThreads.has(summary.id)) {
      return;
    }
    await this.appServer.call('thread/resume', {
      threadId: summary.id,
      model: summary.model,
      cwd: assistantSandboxCwd,
      approvalPolicy: 'never',
      sandbox: assistantThreadSandbox,
      personality: 'pragmatic',
    });
    this.loadedThreads.add(summary.id);
  }

  private buildThreadStartParams(model: string) {
    return {
      model,
      modelProvider: 'openai',
      cwd: assistantSandboxCwd,
      approvalPolicy: 'never',
      sandbox: assistantThreadSandbox,
      personality: 'pragmatic',
      serviceName: 'pulsete_assistant',
      baseInstructions: assistantBaseInstructions,
    };
  }

  private resolveContext(bufferId: string | null, networkId: string | null, target: string | null) {
    const buffer = bufferId ? this.params.conversations.getBuffer(bufferId) : null;
    const effectiveNetworkId = buffer?.networkId ?? networkId;
    const effectiveTarget = buffer?.target ?? target;
    const network = effectiveNetworkId ? this.params.networks.get(effectiveNetworkId) as NetworkProfile | null : null;
    const messages = effectiveNetworkId && effectiveTarget
      ? this.params.conversations.listMessages(effectiveNetworkId, effectiveTarget, contextMessageLimit)
          .slice()
          .reverse()
      : [];
    return { buffer: buffer as BufferState | null, network, messages };
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

  private mapTurn(task: AssistantTaskKind, turn: RawTurn): AssistantTurn {
    const items = Array.isArray(turn.items) ? turn.items : [];
    return {
      id: turn.id,
      status: toTurnStatus(turn.status),
      error: toTurnError(turn.error),
      items: items.map((item) => this.mapItem(task, item)),
    };
  }

  private mapItem(task: AssistantTaskKind, item: RawThreadItem): AssistantItem {
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
      };
    }
    if (item.type === 'agentMessage') {
      const text = 'text' in item && typeof item.text === 'string' ? item.text : '';
      const artifact = parseAssistantArtifact(task, text);
      return {
        type: 'agentMessage',
        id: item.id,
        text,
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
  }

  private publishSnapshot() {
    this.publish({
      type: 'assistant.snapshot',
      assistant: this.snapshot(),
    });
  }

  private failInProgressTurns(error: Error | null): ServerMessage[] {
    const failureMessage = error?.message ?? 'Assistant service became unavailable during the turn';
    const updatedAt = Date.now();
    for (const thread of this.params.assistant.listThreads()) {
      if (thread.turnStatus !== 'inProgress') {
        continue;
      }
      this.params.assistant.upsertThread({
        ...thread,
        turnStatus: 'failed',
        updatedAt,
      });
    }
    return [...this.liveTurns.values()].map((live) => ({
      type: 'assistant.turn.completed' as const,
      threadId: live.threadId,
      turn: {
        ...live.turn,
        status: 'failed',
        error: failureMessage,
      },
    }));
  }

  private publish(message: ServerMessage | readonly ServerMessage[]) {
    this.params.publish(message);
  }
}

const upsertTurnItem = (items: AssistantItem[], nextItem: AssistantItem) => {
  const index = items.findIndex((item) => item.id === nextItem.id);
  if (index === -1) {
    return [...items, nextItem];
  }
  return items.map((item, itemIndex) => itemIndex === index ? nextItem : item);
};

const toTurnStatus = (status: string): AssistantTurnStatus =>
  status === 'completed' || status === 'failed' || status === 'interrupted'
    ? status
    : 'inProgress';

const toTurnError = (error: unknown) => {
  if (!error) {
    return null;
  }
  if (typeof error === 'string') {
    return error;
  }
  if (typeof error === 'object' && error && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return 'Assistant turn failed';
};

const toRateLimits = (
  rateLimits: RawRateLimits,
  previous: AssistantRateLimits | null = null,
): AssistantRateLimits => ({
  limitId: rateLimits.limitId,
  limitName: rateLimits.limitName === undefined ? previous?.limitName ?? null : rateLimits.limitName,
  primary: rateLimits.primary === undefined ? previous?.primary ?? null : rateLimits.primary,
  secondary: rateLimits.secondary === undefined ? previous?.secondary ?? null : rateLimits.secondary,
  credits: rateLimits.credits === undefined ? previous?.credits ?? null : rateLimits.credits,
  planType: rateLimits.planType === undefined ? previous?.planType ?? null : rateLimits.planType,
});

const toRateLimitBuckets = (response: RawRateLimitReadResponse): AssistantRateLimits[] => {
  const fallback = [toRateLimits(response.rateLimits)];
  if (!response.rateLimitsByLimitId) {
    return fallback;
  }
  const currentLimitId = response.rateLimits.limitId;
  const ordered = Object.values(response.rateLimitsByLimitId).map((bucket) => toRateLimits(bucket));
  if (!currentLimitId) {
    return ordered.length > 0 ? ordered : fallback;
  }
  const current = ordered.find((bucket) => bucket.limitId === currentLimitId) ?? fallback[0]!;
  const remaining = ordered.filter((bucket) => bucket.limitId !== currentLimitId);
  return [current, ...remaining];
};

const mergeRateLimitBuckets = (
  currentBuckets: AssistantRateLimits[],
  nextBucket: AssistantRateLimits | null
) => {
  if (!nextBucket) {
    return currentBuckets;
  }
  if (!nextBucket.limitId) {
    return currentBuckets.length > 0 ? [nextBucket, ...currentBuckets.slice(1)] : [nextBucket];
  }
  const existing = currentBuckets.filter((bucket) => bucket.limitId !== nextBucket.limitId);
  return [nextBucket, ...existing];
};

const isString = (value: unknown): value is string => typeof value === 'string';
