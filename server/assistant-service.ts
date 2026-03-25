import type {
  AssistantAccount,
  AssistantActiveBuffer,
  AssistantAskClarification,
  AssistantAskRetrievalMemory,
  AssistantArtifact,
  AssistantAttachmentMetadata,
  AssistantItem,
  AssistantModel,
  AssistantRateLimits,
  AssistantSnapshot,
  AssistantThreadScope,
  AssistantTaskKind,
  AssistantThread,
  AssistantThreadSummary,
  AssistantTurnAttachmentInput,
  AssistantTurnRouting,
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
import { canonicalizeAssistantText } from '../shared/assistant-document.js';
import {
  planAssistantAskTurn,
  resolveAssistantAskRetrieval,
} from './assistant-ask-planner.js';
import { buildAssistantHistoryPackage } from './assistant-history-package.js';
import type {
  RuntimeAssistantStore,
  RuntimeConversationStore,
  RuntimeNetworkStore,
} from './runtime-store-ports.js';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { badRequest } from './app-error.js';

const assistantSandboxCwd = tmpdir();
const assistantThreadSandbox = 'read-only';
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
  executionThreadId: string | null;
  remoteTurnId: string | null;
  turn: AssistantTurn;
};

type PendingExecutionBase = {
  activeBuffer: AssistantActiveBuffer | null;
  attachments: AssistantAttachmentMetadata[];
  localTurnId: string;
  prompt: string;
  resolvedSubject: AssistantActiveBuffer | null;
  routing: AssistantTurnRouting | null;
  threadId: string;
};

type QueuedExecution = PendingExecutionBase & {
  kind: 'turn';
};

type PendingExecution = QueuedExecution & {
  executionThreadId: string;
};

const localAssistantThreadIdPrefix = 'assistant:';
const localAssistantTurnIdPrefix = 'assistant-turn:';
const assistantTranscriptTurnLimit = 8;
const staleTurnFailureMessage = 'Assistant service restarted before this turn finished';

export class AssistantService {
  private readonly appServer: AssistantAppServer;
  private readonly pendingStarts = new Map<string, QueuedExecution>();
  private readonly executionThreads = new Map<string, PendingExecution>();
  private readonly interruptRequests = new Set<string>();
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
    this.reconcilePersistedInProgressThreads();
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
    const scope = resolveAssistantThreadScope(input.task, input.scope, input.bufferId);
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
    const summary = this.requireThread(threadId);
    const localTurns = this.params.assistant.getThreadTurns(threadId) ?? [];
    if (localTurns.length > 0 || isLocalAssistantThreadId(threadId)) {
      const normalizedTurns = normalizeStoredAssistantTurns(summary.task, localTurns);
      if (normalizedTurns.changed) {
        this.params.assistant.saveThreadTurns(threadId, normalizedTurns.turns);
      }
      return {
        ...summary,
        turns: normalizedTurns.turns,
      };
    }
    const turns = await this.importLegacyThreadTurns(summary);
    return {
      ...summary,
      turns,
    };
  }

  async deleteThread(threadId: string) {
    const summary = this.requireThread(threadId);
    const live = this.findLiveTurn(summary.id);
    const pendingExecution = this.hasPendingExecution(summary.id);
    if (live?.executionThreadId && live.remoteTurnId) {
      try {
        await this.appServer.call('turn/interrupt', {
          threadId: live.executionThreadId,
          turnId: live.remoteTurnId,
        });
      } catch {
        // Ignore interrupt races while clearing; late events are discarded once the thread is removed.
      }
    } else if (live || pendingExecution) {
      this.interruptRequests.add(summary.id);
    } else {
      this.interruptRequests.delete(summary.id);
    }
    this.discardLiveThreadState(summary.id);
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
    return this.startExecution(input);
  }

  async interruptThread(threadId: string) {
    const summary = this.requireThread(threadId);
    const live = this.findLiveTurn(summary.id);
    if (live?.executionThreadId && live.remoteTurnId) {
      await this.appServer.call('turn/interrupt', {
        threadId: live.executionThreadId,
        turnId: live.remoteTurnId,
      });
      return;
    }
    if (live || this.hasPendingExecution(summary.id)) {
      this.interruptRequests.add(summary.id);
    }
  }

  async interruptTurn(threadId: string, turnId: string) {
    const live = this.liveTurns.get(turnId);
    if (!live || live.threadId !== threadId) {
      return;
    }
    if (!live.executionThreadId || !live.remoteTurnId) {
      this.interruptRequests.add(threadId);
      return;
    }
    await this.appServer.call('turn/interrupt', {
      threadId: live.executionThreadId,
      turnId: live.remoteTurnId,
    });
  }

  private async startExecution(input: {
    activeBufferId?: string | null;
    attachments?: AssistantTurnAttachmentInput[];
    clientTurnId?: string;
    prompt: string;
    threadId: string;
  }) {
    const summary = this.requireThread(input.threadId);
    if (summary.turnStatus === 'inProgress' || this.hasLiveExecution(summary.id)) {
      throw badRequest('Wait for the current assistant turn to stop before starting another one');
    }
    this.interruptRequests.delete(summary.id);
    const localTurnId = input.clientTurnId ?? `${localAssistantTurnIdPrefix}${randomUUID()}`;
    const existingTurns = this.params.assistant.getThreadTurns(summary.id) ?? [];
    if (existingTurns.some((turn) => turn.id === localTurnId)) {
      throw badRequest('Assistant turn id is already in use');
    }
    const attachmentMetadata = (input.attachments ?? []).map(toAttachmentMetadata);
    const queuedExecution: QueuedExecution = {
      kind: 'turn',
      activeBuffer: this.resolveActiveBuffer(input.activeBufferId ?? null),
      attachments: attachmentMetadata,
      localTurnId,
      prompt: input.prompt,
      resolvedSubject: null,
      routing: null,
      threadId: summary.id,
    };
    const queuedTurn = buildPendingTurn(queuedExecution);
    this.pendingStarts.set(summary.id, queuedExecution);
    this.liveTurns.set(queuedExecution.localTurnId, {
      threadId: summary.id,
      executionThreadId: null,
      remoteTurnId: null,
      turn: queuedTurn,
    });
    this.persistTurn(summary.id, queuedTurn);
    this.params.assistant.upsertThread({
      ...summary,
      turnStatus: 'inProgress',
      updatedAt: Date.now(),
    });
    this.launchExecution(summary.id, queuedExecution, input.attachments ?? []);
    return {
      messages: [
        {
          type: 'assistant.turn.started' as const,
          threadId: summary.id,
          turn: queuedTurn,
        },
      ],
    };
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
    this.pendingStarts.clear();
    this.executionThreads.clear();
    this.interruptRequests.clear();
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
        await this.handleTurnCompleted(params as { threadId: string; turn: RawTurn });
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
    const threadId = this.resolveExecutionThreadOwner(params.threadId);
    const summary = this.params.assistant.getThread(threadId);
    if (!summary) {
      if (this.interruptRequests.delete(threadId)) {
        this.runAppServerTask(async () => {
          await this.appServer.call('turn/interrupt', {
            threadId: params.threadId,
            turnId: params.turn.id,
          });
        });
      }
      return;
    }
    const execution = this.executionThreads.get(params.threadId);
    const localTurnId = execution?.localTurnId ?? this.findLocalTurnId(params.threadId, params.turn.id) ?? params.turn.id;
    const mapped = this.mapTurn(summary.task, params.turn);
    const turn = {
      ...mapped,
      id: localTurnId,
      items: injectPendingUserMessage(mapped.items, localTurnId, execution),
      activeBuffer: execution?.activeBuffer ?? mapped.activeBuffer ?? null,
      resolvedSubject: execution?.resolvedSubject ?? mapped.resolvedSubject ?? null,
      routing: execution?.routing ?? mapped.routing ?? null,
    };
    this.liveTurns.set(localTurnId, {
      threadId,
      executionThreadId: params.threadId,
      remoteTurnId: params.turn.id,
      turn,
    });
    this.persistTurn(threadId, turn);
    this.publish({
      type: 'assistant.turn.started',
      threadId,
      turn,
    });
    if (this.interruptRequests.delete(threadId)) {
      this.runAppServerTask(async () => {
        await this.appServer.call('turn/interrupt', {
          threadId: params.threadId,
          turnId: params.turn.id,
        });
      });
    }
  }

  private async handleTurnCompleted(params: { threadId: string; turn: RawTurn }) {
    const threadId = this.resolveExecutionThreadOwner(params.threadId);
    const summary = this.params.assistant.getThread(threadId);
    if (!summary) {
      this.liveTurns.delete(params.turn.id);
      this.executionThreads.delete(params.threadId);
      this.interruptRequests.delete(threadId);
      return;
    }
    const execution = this.executionThreads.get(params.threadId);
    const localTurnId = execution?.localTurnId ?? this.findLocalTurnId(params.threadId, params.turn.id) ?? params.turn.id;
    const live = this.liveTurns.get(localTurnId);
    const completedTurn = params.turn;
    const mapped = this.mapTurn(summary.task, completedTurn);
    const next = live
      ? {
          ...live.turn,
          status: toTurnStatus(completedTurn.status),
          error: toTurnError(completedTurn.error),
        }
      : {
          ...mapped,
          id: localTurnId,
          items: injectPendingUserMessage(mapped.items, localTurnId, execution),
          activeBuffer: execution?.activeBuffer ?? mapped.activeBuffer ?? null,
          resolvedSubject: execution?.resolvedSubject ?? mapped.resolvedSubject ?? null,
          routing: execution?.routing ?? mapped.routing ?? null,
        };
    this.liveTurns.delete(localTurnId);
    this.executionThreads.delete(params.threadId);
    this.interruptRequests.delete(threadId);
    this.persistTurn(threadId, next);
    this.params.assistant.upsertThread({
      ...summary,
      turnStatus: next.status,
      updatedAt: Date.now(),
    });
    this.publish([
      {
        type: 'assistant.turn.completed',
        threadId,
        turn: next,
      },
      {
        type: 'assistant.snapshot',
        assistant: this.snapshot(),
      },
    ]);
  }

  private handleItemStarted(params: { threadId: string; turnId: string; item: RawThreadItem }) {
    const execution = this.executionThreads.get(params.threadId);
    if (params.item.type === 'userMessage') {
      return;
    }
    const threadId = this.resolveExecutionThreadOwner(params.threadId);
    const summary = this.params.assistant.getThread(threadId);
    if (!summary) {
      return;
    }
    const localTurnId = execution?.localTurnId ?? this.findLocalTurnId(params.threadId, params.turnId) ?? params.turnId;
    const live = this.liveTurns.get(localTurnId) ?? {
      threadId,
      executionThreadId: execution?.executionThreadId ?? params.threadId,
      remoteTurnId: params.turnId,
      turn: {
        id: localTurnId,
        status: 'inProgress' as const,
        error: null,
        items: buildPendingUserItems(localTurnId, execution),
        activeBuffer: execution?.activeBuffer ?? null,
        resolvedSubject: execution?.resolvedSubject ?? null,
        routing: execution?.routing ?? null,
      },
    };
    const item = this.mapItem(summary.task, params.item);
    live.turn.items = upsertTurnItem(live.turn.items, item);
    live.executionThreadId = execution?.executionThreadId ?? params.threadId;
    live.remoteTurnId = params.turnId;
    this.liveTurns.set(localTurnId, live);
    this.persistTurn(threadId, live.turn);
    this.publish({
      type: 'assistant.item.started',
      threadId,
      turnId: localTurnId,
      item,
    });
  }

  private handleItemDelta(params: { threadId: string; turnId: string; itemId: string; delta: string }) {
    const localTurnId = this.findLocalTurnId(params.threadId, params.turnId) ?? params.turnId;
    const live = this.liveTurns.get(localTurnId);
    if (!live) {
      return;
    }
    const summary = this.params.assistant.getThread(live.threadId);
    live.turn.items = live.turn.items.map((item) =>
      item.id === params.itemId && item.type === 'agentMessage'
        ? {
            ...item,
            text: summary?.task === 'ask'
              ? canonicalizeAssistantText(item.text + params.delta)
              : item.text + params.delta,
          }
        : item
    );
    this.persistTurn(live.threadId, live.turn);
    this.publish({
      type: 'assistant.item.delta',
      threadId: live.threadId,
      turnId: localTurnId,
      itemId: params.itemId,
      delta: params.delta,
    });
  }

  private handleItemCompleted(params: { threadId: string; turnId: string; item: RawThreadItem }) {
    if (params.item.type === 'userMessage') {
      return;
    }
    const threadId = this.resolveExecutionThreadOwner(params.threadId);
    const summary = this.params.assistant.getThread(threadId);
    if (!summary) {
      return;
    }
    const localTurnId = this.findLocalTurnId(params.threadId, params.turnId) ?? params.turnId;
    const live = this.liveTurns.get(localTurnId);
    if (!live) {
      return;
    }
    const item = this.mapItem(summary.task, params.item);
    live.turn.items = upsertTurnItem(live.turn.items, item);
    this.persistTurn(threadId, live.turn);
    this.publish({
      type: 'assistant.item.completed',
      threadId,
      turnId: localTurnId,
      item,
    });
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

  private toAssistantActiveBuffer(buffer: BufferState | null) {
    if (!buffer) {
      return null;
    }
    return {
      bufferId: buffer.id,
      networkId: buffer.networkId,
      target: buffer.target,
      title: buffer.target,
    } satisfies AssistantActiveBuffer;
  }

  private resolveActiveBuffer(activeBufferId: string | null) {
    return this.toAssistantActiveBuffer(activeBufferId ? this.params.conversations.getBuffer(activeBufferId) : null);
  }

  private resolveBufferTaskContext(
    bufferId: string | null,
    networkId: string | null,
    scope: AssistantThreadScope,
    target: string | null,
    prompt: string,
    task: AssistantTaskKind,
  ) {
    if (scope === 'free') {
      return {
        buffer: null,
        attachments: [],
        network: null,
        context: '',
      };
    }
    const buffer = bufferId ? this.params.conversations.getBuffer(bufferId) : null;
    const effectiveNetworkId = buffer?.networkId ?? networkId;
    const effectiveTarget = buffer?.target ?? target;
    const network = effectiveNetworkId ? this.params.networks.get(effectiveNetworkId) as NetworkProfile | null : null;
    const messages = effectiveNetworkId && effectiveTarget
      ? this.params.conversations.listAllMessages(effectiveNetworkId, effectiveTarget)
      : [];
    const history = buildAssistantHistoryPackage({
      messages,
      prompt,
      task,
    });
    return {
      buffer: buffer as BufferState | null,
      attachments: history.attachments,
      network,
      context: history.context,
    };
  }

  private resolveAskContext(
    activeBuffer: AssistantActiveBuffer | null,
    priorTurns: AssistantTurn[],
    prompt: string,
  ) {
    const previousRetrievals = findRecentAskRetrievals(priorTurns);
    const rememberedSubject = findRecentAskResolvedSubject(priorTurns);
    const queryBuffers = this.params.conversations.listBuffers()
      .filter((buffer) => buffer.kind === 'query')
      .map((buffer) => this.toAssistantActiveBuffer(buffer))
      .filter((buffer): buffer is AssistantActiveBuffer => buffer !== null);
    const plan = planAssistantAskTurn({
      prompt,
      queryBuffers,
      rememberedSubject,
      pendingClarification: findPendingAskClarification(priorTurns),
      previousRetrievals,
      selectedBuffer: activeBuffer,
    });
    const priorRetrievedContext = plan.reusePreviousRetrievals
      ? renderAskRetrievalContexts(previousRetrievals)
      : '';
    if (plan.outcome !== 'retrieve' || !plan.resolvedSubject) {
      return {
        activeBuffer,
        resolvedSubject: plan.resolvedSubject,
        askInstruction: plan.instruction,
        priorRetrievedContext,
        retrievedContext: '',
        routing: mergeAskTurnRouting(plan.routing, []),
      };
    }
    const retrievals = plan.requests.map((request) => resolveAssistantAskRetrieval({
      conversations: this.params.conversations,
      request,
      subject: plan.resolvedSubject,
    }));
    return {
      activeBuffer,
      resolvedSubject: plan.resolvedSubject,
      askInstruction: plan.instruction,
      priorRetrievedContext,
      retrievedContext: renderAskRetrievalContexts(retrievals),
      routing: mergeAskTurnRouting(plan.routing, retrievals),
    };
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

  private async importLegacyThreadTurns(summary: AssistantThreadSummary) {
    try {
      const response = await this.appServer.call<RawThreadReadResponse>('thread/read', {
        threadId: summary.id,
        includeTurns: true,
      });
      const turns = Array.isArray(response.thread?.turns)
        ? response.thread.turns.map((turn) => this.mapTurn(summary.task, turn))
        : [];
      this.params.assistant.saveThreadTurns(summary.id, turns);
      return turns;
    } catch {
      return [];
    }
  }

  private resolveExecutionThreadOwner(executionThreadId: string) {
    const execution = this.executionThreads.get(executionThreadId);
    if (execution) {
      return execution.threadId;
    }
    for (const live of this.liveTurns.values()) {
      if (live.executionThreadId === executionThreadId) {
        return live.threadId;
      }
    }
    return executionThreadId;
  }

  private persistTurn(threadId: string, turn: AssistantTurn) {
    const turns = this.params.assistant.getThreadTurns(threadId) ?? [];
    this.params.assistant.saveThreadTurns(threadId, upsertTurn(turns, turn));
  }

  private launchExecution(
    threadId: string,
    queuedExecution: QueuedExecution,
    attachments: AssistantTurnAttachmentInput[],
  ) {
    void this.runExecution(threadId, queuedExecution, attachments).catch((error) => {
      this.failQueuedTurn(threadId, queuedExecution.localTurnId, error);
    });
  }

  private async runExecution(
    threadId: string,
    queuedExecution: QueuedExecution,
    attachments: AssistantTurnAttachmentInput[],
  ) {
    const summary = this.params.assistant.getThread(threadId);
    if (!summary) {
      return;
    }
    const execution = await this.appServer.call<RawThreadStartResponse>('thread/start', this.buildThreadStartParams(summary.model));
    const pendingExecution: PendingExecution = {
      ...queuedExecution,
      executionThreadId: execution.thread.id,
    };
    if (this.pendingStarts.get(threadId)?.localTurnId === queuedExecution.localTurnId) {
      this.pendingStarts.delete(threadId);
    }
    this.executionThreads.set(execution.thread.id, pendingExecution);
    const live = this.liveTurns.get(queuedExecution.localTurnId);
    if (live) {
      live.executionThreadId = execution.thread.id;
      this.liveTurns.set(queuedExecution.localTurnId, live);
    }
    const currentSummary = this.params.assistant.getThread(threadId);
    if (!currentSummary) {
      this.discardPendingExecution(threadId, queuedExecution.localTurnId);
      return;
    }
    const priorTurns = (this.params.assistant.getThreadTurns(threadId) ?? [])
      .filter((turn) => turn.id !== queuedExecution.localTurnId);
    const priorTranscript = buildAssistantTranscript(priorTurns);
    const turnInput = currentSummary.task === 'ask'
      ? (() => {
          const askContext = this.resolveAskContext(queuedExecution.activeBuffer, priorTurns, queuedExecution.prompt);
          pendingExecution.routing = askContext.routing;
          pendingExecution.resolvedSubject = askContext.resolvedSubject;
          const liveTurn = this.liveTurns.get(queuedExecution.localTurnId);
          if (liveTurn) {
            liveTurn.turn = {
              ...liveTurn.turn,
              resolvedSubject: askContext.resolvedSubject,
              routing: askContext.routing,
            };
            this.liveTurns.set(queuedExecution.localTurnId, liveTurn);
            this.persistTurn(threadId, liveTurn.turn);
          }
          return buildAssistantExecutionInput({
            activeBuffer: askContext.activeBuffer,
            askInstruction: askContext.askInstruction,
            attachments,
            priorRetrievedContext: askContext.priorRetrievedContext,
            priorTranscript,
            prompt: queuedExecution.prompt,
            resolvedSubject: askContext.resolvedSubject,
            retrievedContext: askContext.retrievedContext,
            scope: currentSummary.scope,
            task: currentSummary.task,
          });
        })()
      : (() => {
          const context = this.resolveBufferTaskContext(
            currentSummary.bufferId,
            currentSummary.networkId,
            currentSummary.scope,
            currentSummary.target,
            queuedExecution.prompt,
            currentSummary.task,
          );
          return buildAssistantExecutionInput({
            attachments: [...attachments, ...context.attachments],
            buffer: context.buffer,
            context: context.context,
            network: context.network,
            priorTranscript,
            prompt: queuedExecution.prompt,
            scope: currentSummary.scope,
            task: currentSummary.task,
          });
        })();
    await this.appServer.call('turn/start', {
      threadId: execution.thread.id,
      input: turnInput,
      cwd: assistantSandboxCwd,
      approvalPolicy: 'never',
      sandboxPolicy: assistantTurnSandboxPolicy,
      model: currentSummary.model,
      personality: 'pragmatic',
      outputSchema: getAssistantOutputSchema(currentSummary.task),
    });
  }

  private failQueuedTurn(threadId: string, localTurnId: string, error: unknown) {
    const live = this.liveTurns.get(localTurnId);
    this.discardPendingExecution(threadId, localTurnId);
    if (!live) {
      return;
    }
    this.liveTurns.delete(localTurnId);
    this.interruptRequests.delete(threadId);
    const failedTurn = {
      ...live.turn,
      status: 'failed' as const,
      error: toTurnError(error) ?? (error instanceof Error ? error.message : String(error)),
    };
    this.persistTurn(threadId, failedTurn);
    const summary = this.params.assistant.getThread(threadId);
    if (!summary) {
      return;
    }
    this.params.assistant.upsertThread({
      ...summary,
      turnStatus: failedTurn.status,
      updatedAt: Date.now(),
    });
    this.publish([
      {
        type: 'assistant.turn.completed',
        threadId,
        turn: failedTurn,
      },
      {
        type: 'assistant.snapshot',
        assistant: this.snapshot(),
      },
    ]);
  }

  private failPersistedTurns(threadId: string, failureMessage: string) {
    const turns = this.params.assistant.getThreadTurns(threadId) ?? [];
    const changedTurns: AssistantTurn[] = [];
    const nextTurns = turns.map((turn) => {
      if (turn.status !== 'inProgress') {
        return turn;
      }
      const failedTurn = {
        ...turn,
        status: 'failed' as const,
        error: failureMessage,
      };
      changedTurns.push(failedTurn);
      return failedTurn;
    });
    if (changedTurns.length === 0) {
      return [];
    }
    this.params.assistant.saveThreadTurns(threadId, nextTurns);
    return changedTurns;
  }

  private hasLiveExecution(threadId: string) {
    for (const execution of this.executionThreads.values()) {
      if (execution.threadId === threadId) {
        return true;
      }
    }
    for (const live of this.liveTurns.values()) {
      if (live.threadId === threadId) {
        return true;
      }
    }
    return false;
  }

  private hasPendingExecution(threadId: string) {
    const pendingStart = this.pendingStarts.get(threadId);
    if (pendingStart) {
      return true;
    }
    for (const execution of this.executionThreads.values()) {
      if (execution.threadId === threadId) {
        return true;
      }
    }
    return false;
  }

  private findLiveTurn(threadId: string) {
    for (const live of this.liveTurns.values()) {
      if (live.threadId === threadId) {
        return live;
      }
    }
    return null;
  }

  private findPendingExecution(threadId: string) {
    const pendingStart = this.pendingStarts.get(threadId);
    if (pendingStart) {
      return pendingStart;
    }
    for (const execution of this.executionThreads.values()) {
      if (execution.threadId === threadId) {
        return execution;
      }
    }
    return null;
  }

  private discardLiveThreadState(threadId: string) {
    this.pendingStarts.delete(threadId);
    for (const [turnId, live] of this.liveTurns.entries()) {
      if (live.threadId === threadId) {
        this.liveTurns.delete(turnId);
      }
    }
  }

  private discardPendingExecution(threadId: string, localTurnId: string) {
    if (this.pendingStarts.get(threadId)?.localTurnId === localTurnId) {
      this.pendingStarts.delete(threadId);
    }
    for (const [executionThreadId, execution] of this.executionThreads.entries()) {
      if (execution.threadId === threadId && execution.localTurnId === localTurnId) {
        this.executionThreads.delete(executionThreadId);
      }
    }
  }

  private findLocalTurnId(executionThreadId: string, remoteTurnId: string) {
    const execution = this.executionThreads.get(executionThreadId);
    if (execution) {
      return execution.localTurnId;
    }
    for (const [localTurnId, live] of this.liveTurns.entries()) {
      if (
        live.executionThreadId === executionThreadId
        || live.remoteTurnId === remoteTurnId
        || live.turn.id === remoteTurnId
      ) {
        return localTurnId;
      }
    }
    return null;
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
      activeBuffer: null,
      resolvedSubject: null,
      routing: null,
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
        attachments: [],
      };
    }
    if (item.type === 'agentMessage') {
      const text = 'text' in item && typeof item.text === 'string' ? item.text : '';
      const normalizedText = task === 'ask' ? canonicalizeAssistantText(text) : text;
      const artifact = parseAssistantArtifact(task, text);
      return {
        type: 'agentMessage',
        id: item.id,
        text: normalizedText,
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

  private reconcilePersistedInProgressThreads() {
    const updatedAt = Date.now();
    for (const thread of this.params.assistant.listThreads()) {
      if (thread.turnStatus !== 'inProgress') {
        continue;
      }
      this.failPersistedTurns(thread.id, staleTurnFailureMessage);
      this.params.assistant.upsertThread({
        ...thread,
        turnStatus: 'failed',
        updatedAt,
      });
    }
  }

  private failInProgressTurns(error: Error | null): ServerMessage[] {
    const failureMessage = error?.message ?? 'Assistant service became unavailable during the turn';
    const updatedAt = Date.now();
    const liveTurnIds = new Set(this.liveTurns.keys());
    const messages: ServerMessage[] = [];
    for (const thread of this.params.assistant.listThreads()) {
      if (thread.turnStatus !== 'inProgress') {
        continue;
      }
      const storedFailedTurns = this.failPersistedTurns(thread.id, failureMessage);
      this.params.assistant.upsertThread({
        ...thread,
        turnStatus: 'failed',
        updatedAt,
      });
      for (const turn of storedFailedTurns) {
        if (liveTurnIds.has(turn.id)) {
          continue;
        }
        messages.push({
          type: 'assistant.turn.completed',
          threadId: thread.id,
          turn,
        });
      }
    }
    return [
      ...messages,
      ...[...this.liveTurns.values()].map((live) => {
        const failedTurn = {
          ...live.turn,
          status: 'failed' as const,
          error: failureMessage,
        };
        this.persistTurn(live.threadId, failedTurn);
        return {
          type: 'assistant.turn.completed' as const,
          threadId: live.threadId,
          turn: failedTurn,
        };
      }),
    ];
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

const upsertTurn = (turns: AssistantTurn[], nextTurn: AssistantTurn) => {
  const index = turns.findIndex((turn) => turn.id === nextTurn.id);
  if (index === -1) {
    return [...turns, nextTurn];
  }
  return turns.map((turn, turnIndex) => turnIndex === index ? nextTurn : turn);
};

const buildAssistantExecutionInput = ({
  activeBuffer = null,
  askInstruction = '',
  attachments,
  buffer = null,
  context = '',
  network = null,
  priorRetrievedContext = '',
  priorTranscript,
  prompt,
  resolvedSubject = null,
  retrievedContext = '',
  scope,
  task,
}: {
  activeBuffer?: AssistantActiveBuffer | null;
  askInstruction?: string;
  attachments: AssistantTurnAttachmentInput[];
  buffer?: BufferState | null;
  context?: string;
  network?: NetworkProfile | null;
  priorRetrievedContext?: string;
  priorTranscript: string;
  prompt: string;
  resolvedSubject?: AssistantActiveBuffer | null;
  retrievedContext?: string;
  scope: AssistantThreadScope;
  task: AssistantTaskKind;
}) => {
  const items: Array<
    | { type: 'text'; text: string }
    | { type: 'image'; url: string }
  > = [{
    type: 'text',
    text: buildAssistantTurnInput({
      activeBuffer,
      attachments: attachments.map(toAttachmentMetadata),
      askInstruction,
      buffer,
      context,
      network,
      priorRetrievedContext,
      priorTranscript,
      prompt,
      resolvedSubject,
      retrievedContext,
      scope,
      task,
    }),
  }];
  for (const attachment of attachments) {
    if (attachment.kind === 'text') {
      items.push({
        type: 'text' as const,
        text: [
          `Attached text file: ${attachment.name}`,
          `Mime type: ${attachment.mimeType}`,
          `Size: ${attachment.size} bytes`,
          '',
          attachment.text,
        ].join('\n'),
      });
      continue;
    }
    items.push({
      type: 'image' as const,
      url: attachment.dataUrl,
    });
  }
  return items;
};

const buildPendingTurn = (execution: PendingExecutionBase): AssistantTurn => ({
  id: execution.localTurnId,
  status: 'inProgress',
  error: null,
  items: [buildPendingUserMessage(execution.localTurnId, execution)],
  activeBuffer: execution.activeBuffer,
  resolvedSubject: execution.resolvedSubject,
  routing: execution.routing,
});

const buildPendingUserItems = (turnId: string, execution: PendingExecutionBase | undefined) =>
  execution ? [buildPendingUserMessage(turnId, execution)] : [];

const injectPendingUserMessage = (
  items: AssistantItem[],
  turnId: string,
  execution: PendingExecutionBase | undefined,
) => {
  const filtered = items.filter((item) => item.type !== 'userMessage');
  return execution ? [buildPendingUserMessage(turnId, execution), ...filtered] : filtered;
};

const buildPendingUserMessage = (turnId: string, execution: PendingExecutionBase): AssistantItem => ({
  type: 'userMessage',
  id: `${turnId}:user`,
  text: execution.prompt.trim(),
  attachments: execution.attachments,
});

const normalizeStoredAssistantTurns = (
  task: AssistantTaskKind,
  turns: AssistantTurn[],
) => {
  if (task !== 'ask' || turns.length === 0) {
    return { turns, changed: false };
  }

  let changed = false;
  const normalizedTurns = turns.map((turn) => {
    let turnChanged = false;
    const items = turn.items.map((item) => {
      if (item.type !== 'agentMessage') {
        return item;
      }
      const text = canonicalizeAssistantText(item.text);
      if (text === item.text) {
        return item;
      }
      changed = true;
      turnChanged = true;
      return {
        ...item,
        text,
      };
    });
    return turnChanged ? { ...turn, items } : turn;
  });

  return {
    turns: changed ? normalizedTurns : turns,
    changed,
  };
};

const findPendingAskClarification = (turns: AssistantTurn[]): AssistantAskClarification | null => {
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const turn = turns[index];
    if (!turn || turn.status === 'failed') {
      continue;
    }
    const pendingClarification = turn.routing?.pendingClarification ?? null;
    const hasAssistantReply = turn.items.some((item) => item.type === 'agentMessage' && item.text.trim().length > 0);
    if (pendingClarification && hasAssistantReply) {
      return pendingClarification;
    }
    return null;
  }
  return null;
};

const findRecentAskResolvedSubject = (turns: AssistantTurn[]): AssistantActiveBuffer | null => {
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const turn = turns[index];
    if (!turn || turn.status === 'failed') {
      continue;
    }
    const hasAssistantReply = turn.items.some((item) => item.type === 'agentMessage' && item.text.trim().length > 0);
    if (turn.resolvedSubject && hasAssistantReply) {
      return turn.resolvedSubject;
    }
    return null;
  }
  return null;
};

const findRecentAskRetrievals = (turns: AssistantTurn[]): AssistantAskRetrievalMemory[] => {
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const turn = turns[index];
    if (!turn || turn.status === 'failed') {
      continue;
    }
    const hasAssistantReply = turn.items.some((item) => item.type === 'agentMessage' && item.text.trim().length > 0);
    const retrievals = turn.routing?.retrievals?.length
      ? turn.routing.retrievals
      : turn.routing?.retrieval
        ? [turn.routing.retrieval]
        : [];
    if (retrievals.length > 0 && hasAssistantReply) {
      return retrievals;
    }
    return [];
  }
  return [];
};

const mergeAskTurnRouting = (
  routing: AssistantTurnRouting | null,
  retrievals: AssistantAskRetrievalMemory[],
): AssistantTurnRouting | null => {
  const next = {
    ...(routing ?? {}),
    retrieval: retrievals.at(-1) ?? null,
    retrievals,
  };
  return next.pendingClarification || next.retrieval || next.retrievals.length > 0 ? next : null;
};

const renderAskRetrievalContexts = (retrievals: AssistantAskRetrievalMemory[]) =>
  retrievals
    .map((retrieval, index) => retrievals.length === 1
      ? retrieval.context
      : [
          `Retrieval round ${index + 1}:`,
          retrieval.context,
        ].join('\n'))
    .join('\n\n---\n\n');

const buildAssistantTranscript = (turns: AssistantTurn[]) => {
  const recentTurns = turns.slice(-assistantTranscriptTurnLimit);
  const entries = recentTurns.flatMap((turn) => {
    const transcript = turn.items.flatMap((item) => {
      if (item.type === 'userMessage') {
        const sections = [`User: ${truncateTranscriptText(item.text.trim() || '(empty request)')}`];
        if (item.attachments.length > 0) {
          sections.push(`Attachments: ${item.attachments.map(renderAttachmentLabel).join(', ')}`);
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
  });
  return entries.join('\n\n---\n\n');
};

const truncateTranscriptText = (text: string, limit = 2000) =>
  text.length > limit ? `${text.slice(0, limit).trimEnd()}\n[…truncated…]` : text;

const renderAttachmentLabel = (attachment: AssistantAttachmentMetadata) =>
  `${attachment.name} (${attachment.kind}, ${attachment.mimeType}, ${attachment.size} bytes)`;

const toAttachmentMetadata = (attachment: AssistantTurnAttachmentInput): AssistantAttachmentMetadata => ({
  id: attachment.id,
  name: attachment.name,
  mimeType: attachment.mimeType,
  size: attachment.size,
  kind: attachment.kind,
});

const resolveAssistantThreadScope = (
  task: AssistantTaskKind,
  scope: AssistantThreadScope | undefined,
  _bufferId: string | null,
): AssistantThreadScope => {
  if (task !== 'ask') {
    return 'buffer';
  }
  return scope ?? 'free';
};

const isLocalAssistantThreadId = (threadId: string) => threadId.startsWith(localAssistantThreadIdPrefix);

const toTurnStatus = (status: string): AssistantTurnStatus =>
  status === 'completed' || status === 'failed' || status === 'interrupted'
    ? status
    : 'inProgress';

const toTurnError = (error: unknown) => {
  if (!error) {
    return null;
  }
  if (typeof error === 'string') {
    return normalizeTurnErrorMessage(error);
  }
  if (typeof error === 'object' && error && 'message' in error && typeof error.message === 'string') {
    return normalizeTurnErrorMessage(error.message);
  }
  return 'Assistant turn failed';
};

const normalizeTurnErrorMessage = (message: string) => {
  try {
    const parsed = JSON.parse(message) as {
      error?: { message?: unknown };
      message?: unknown;
    };
    if (parsed?.error && typeof parsed.error.message === 'string') {
      return parsed.error.message;
    }
    if (typeof parsed?.message === 'string') {
      return parsed.message;
    }
  } catch {
    return message;
  }
  return message;
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
