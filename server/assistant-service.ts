import type {
  AssistantAccount,
  AssistantArtifact,
  AssistantAttachmentMetadata,
  AssistantItem,
  AssistantModel,
  AssistantRateLimits,
  AssistantSnapshot,
  AssistantTaskKind,
  AssistantThread,
  AssistantThreadSummary,
  AssistantTurnAttachmentInput,
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
import {
  type AssistantHistoryImportResult,
  assistantHistoryImportOutputSchema,
  buildAssistantHistoryImportInput,
  buildAssistantHistoryImportSummary,
  parseAssistantHistoryImportResult,
} from './assistant-history-import.js';
import { buildAssistantHistoryContext } from './assistant-history-context.js';
import type {
  RuntimeAssistantStore,
  RuntimeConversationStore,
  RuntimeNetworkStore,
} from './runtime-store-ports.js';
import type { MessageInput } from './storage-types.js';
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
  executionThreadId: string;
  turn: AssistantTurn;
};

type PendingExecutionBase = {
  attachments: AssistantAttachmentMetadata[];
  executionThreadId: string;
  prompt: string;
  threadId: string;
};

type PendingTurnExecution = PendingExecutionBase & {
  kind: 'turn';
};

type PendingImportExecution = PendingExecutionBase & {
  kind: 'import';
};

type PendingExecution = PendingTurnExecution | PendingImportExecution;

const localAssistantThreadIdPrefix = 'assistant:';
const assistantTranscriptTurnLimit = 8;

export class AssistantService {
  private readonly appServer: AssistantAppServer;
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
    const threadId = `${localAssistantThreadIdPrefix}${randomUUID()}`;
    const summary = this.params.assistant.upsertThread({
      id: threadId,
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
      return {
        ...summary,
        turns: localTurns,
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
    if (live) {
      try {
        await this.appServer.call('turn/interrupt', {
          threadId: live.executionThreadId,
          turnId: live.turn.id,
        });
      } catch {
        // Ignore interrupt races while clearing; late events are discarded once the thread is removed.
      }
    } else if (pendingExecution) {
      this.interruptRequests.add(summary.id);
    } else {
      this.interruptRequests.delete(summary.id);
    }
    this.discardLiveThreadState(summary.id);
    this.params.assistant.removeThread(summary.id);
    this.publishSnapshot();
  }

  async startTurn(input: {
    attachments?: AssistantTurnAttachmentInput[];
    threadId: string;
    prompt: string;
  }) {
    await this.startExecution({
      attachments: input.attachments ?? [],
      mode: 'turn',
      prompt: input.prompt,
      threadId: input.threadId,
    });
  }

  async importHistory(input: {
    attachments: AssistantTurnAttachmentInput[];
    prompt?: string;
    threadId: string;
  }) {
    const prompt = input.prompt?.trim() || 'Import the attached logs into this buffer history.';
    await this.startExecution({
      attachments: input.attachments,
      mode: 'import',
      prompt,
      threadId: input.threadId,
    });
  }

  async interruptThread(threadId: string) {
    const summary = this.requireThread(threadId);
    const live = this.findLiveTurn(summary.id);
    if (live) {
      await this.appServer.call('turn/interrupt', {
        threadId: live.executionThreadId,
        turnId: live.turn.id,
      });
      return;
    }
    if (this.hasPendingExecution(summary.id)) {
      this.interruptRequests.add(summary.id);
    }
  }

  async interruptTurn(threadId: string, turnId: string) {
    const live = this.liveTurns.get(turnId);
    if (!live || live.threadId !== threadId) {
      return;
    }
    await this.appServer.call('turn/interrupt', { threadId: live.executionThreadId, turnId });
  }

  private async startExecution(input: {
    attachments: AssistantTurnAttachmentInput[];
    mode: PendingExecution['kind'];
    prompt: string;
    threadId: string;
  }) {
    const summary = this.requireThread(input.threadId);
    if (summary.turnStatus === 'inProgress' || this.hasLiveExecution(summary.id)) {
      throw badRequest('Wait for the current assistant turn to stop before starting another one');
    }
    this.interruptRequests.delete(summary.id);
    const context = input.mode === 'turn'
      ? this.resolveContext(summary.bufferId, summary.networkId, summary.target, input.prompt, summary.task)
      : null;
    const importBuffer = input.mode === 'import' ? this.resolveImportBuffer(summary) : null;
    const importNetwork = importBuffer
      ? this.params.networks.get(importBuffer.networkId) as NetworkProfile | null
      : null;
    const execution = await this.appServer.call<RawThreadStartResponse>('thread/start', this.buildThreadStartParams(summary.model));
    const attachments = input.attachments.map(toAttachmentMetadata);
    this.executionThreads.set(execution.thread.id, {
      kind: input.mode,
      attachments,
      executionThreadId: execution.thread.id,
      prompt: input.prompt,
      threadId: summary.id,
    });
    this.params.assistant.upsertThread({
      ...summary,
      turnStatus: 'inProgress',
      updatedAt: Date.now(),
    });
    this.publishSnapshot();
    try {
      await this.appServer.call('turn/start', {
        threadId: execution.thread.id,
        input: input.mode === 'import'
          ? buildAssistantImportExecutionInput({
              attachments: input.attachments,
              buffer: importBuffer!,
              network: importNetwork,
              prompt: input.prompt,
            })
          : buildAssistantExecutionInput({
              attachments: input.attachments,
              buffer: context?.buffer ?? null,
              context: context?.context ?? '',
              network: context?.network ?? null,
              prompt: input.prompt,
              task: summary.task,
              priorTranscript: buildAssistantTranscript(this.params.assistant.getThreadTurns(summary.id) ?? []),
            }),
        cwd: assistantSandboxCwd,
        approvalPolicy: 'never',
        sandboxPolicy: assistantTurnSandboxPolicy,
        model: summary.model,
        personality: 'pragmatic',
        outputSchema: input.mode === 'import'
          ? assistantHistoryImportOutputSchema
          : getAssistantOutputSchema(summary.task),
      });
    } catch (error) {
      this.executionThreads.delete(execution.thread.id);
      this.interruptRequests.delete(summary.id);
      this.params.assistant.upsertThread(summary);
      this.publishSnapshot();
      throw error;
    }
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
    const mapped = this.mapTurn(summary.task, params.turn);
    const turn = execution?.kind === 'import'
      ? {
          ...mapped,
          items: buildPendingUserItems(params.turn.id, execution),
        }
      : {
          ...mapped,
          items: injectPendingUserMessage(mapped.items, params.turn.id, execution),
        };
    this.liveTurns.set(turn.id, {
      threadId,
      executionThreadId: params.threadId,
      turn,
    });
    this.publish({
      type: 'assistant.turn.started',
      threadId,
      turn,
    });
    if (this.interruptRequests.delete(threadId)) {
      this.runAppServerTask(async () => {
        await this.appServer.call('turn/interrupt', {
          threadId: params.threadId,
          turnId: turn.id,
        });
      });
    }
  }

  private handleTurnCompleted(params: { threadId: string; turn: RawTurn }) {
    const threadId = this.resolveExecutionThreadOwner(params.threadId);
    const summary = this.params.assistant.getThread(threadId);
    if (!summary) {
      this.liveTurns.delete(params.turn.id);
      this.executionThreads.delete(params.threadId);
      this.interruptRequests.delete(threadId);
      return;
    }
    const live = this.liveTurns.get(params.turn.id);
    const execution = this.executionThreads.get(params.threadId);
    const mapped = this.mapTurn(summary.task, params.turn);
    const importCompletion = execution?.kind === 'import'
      ? this.completeImportTurn(summary, params.turn, execution, live?.turn ?? null)
      : null;
    const next = importCompletion?.turn ?? (
      live
        ? {
            ...live.turn,
            status: toTurnStatus(params.turn.status),
            error: toTurnError(params.turn.error),
          }
        : {
            ...mapped,
            items: injectPendingUserMessage(mapped.items, params.turn.id, execution),
          }
    );
    this.liveTurns.delete(params.turn.id);
    this.executionThreads.delete(params.threadId);
    this.interruptRequests.delete(threadId);
    this.persistTurn(threadId, next);
    this.params.assistant.upsertThread({
      ...summary,
      turnStatus: next.status,
      updatedAt: Date.now(),
    });
    const publishedMessages = importCompletion?.messages ?? [];
    this.publish([
      ...publishedMessages,
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
    if (params.item.type === 'userMessage' || execution?.kind === 'import') {
      return;
    }
    const threadId = this.resolveExecutionThreadOwner(params.threadId);
    const summary = this.params.assistant.getThread(threadId);
    if (!summary) {
      return;
    }
    const live = this.liveTurns.get(params.turnId) ?? {
      threadId,
      executionThreadId: params.threadId,
      turn: {
        id: params.turnId,
        status: 'inProgress' as const,
        error: null,
        items: buildPendingUserItems(params.turnId, execution),
      },
    };
    const item = this.mapItem(summary.task, params.item);
    live.turn.items = upsertTurnItem(live.turn.items, item);
    this.liveTurns.set(params.turnId, live);
    this.publish({
      type: 'assistant.item.started',
      threadId,
      turnId: params.turnId,
      item,
    });
  }

  private handleItemDelta(params: { threadId: string; turnId: string; itemId: string; delta: string }) {
    if (this.executionThreads.get(params.threadId)?.kind === 'import') {
      return;
    }
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
      threadId: live.threadId,
      turnId: params.turnId,
      itemId: params.itemId,
      delta: params.delta,
    });
  }

  private handleItemCompleted(params: { threadId: string; turnId: string; item: RawThreadItem }) {
    const execution = this.executionThreads.get(params.threadId);
    if (params.item.type === 'userMessage' || execution?.kind === 'import') {
      return;
    }
    const threadId = this.resolveExecutionThreadOwner(params.threadId);
    const summary = this.params.assistant.getThread(threadId);
    if (!summary) {
      return;
    }
    const live = this.liveTurns.get(params.turnId);
    if (!live) {
      return;
    }
    const item = this.mapItem(summary.task, params.item);
    live.turn.items = upsertTurnItem(live.turn.items, item);
    this.publish({
      type: 'assistant.item.completed',
      threadId,
      turnId: params.turnId,
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

  private resolveContext(
    bufferId: string | null,
    networkId: string | null,
    target: string | null,
    prompt: string,
    task: AssistantTaskKind,
  ) {
    const buffer = bufferId ? this.params.conversations.getBuffer(bufferId) : null;
    const effectiveNetworkId = buffer?.networkId ?? networkId;
    const effectiveTarget = buffer?.target ?? target;
    const network = effectiveNetworkId ? this.params.networks.get(effectiveNetworkId) as NetworkProfile | null : null;
    const messages = effectiveNetworkId && effectiveTarget
      ? this.params.conversations.listAllMessages(effectiveNetworkId, effectiveTarget)
      : [];
    return {
      buffer: buffer as BufferState | null,
      network,
      context: buildAssistantHistoryContext({
        messages,
        prompt,
        task,
      }),
    };
  }

  private completeImportTurn(
    summary: AssistantThreadSummary,
    rawTurn: RawTurn,
    execution: PendingImportExecution,
    liveTurn: AssistantTurn | null,
  ): { turn: AssistantTurn; messages: ServerMessage[] } {
    const baseItems = liveTurn?.items ?? buildPendingUserItems(rawTurn.id, execution);
    const failedTurn = {
      id: rawTurn.id,
      status: 'failed' as const,
      error: toTurnError(rawTurn.error) ?? 'Assistant turn failed',
      items: baseItems,
    };
    if (toTurnStatus(rawTurn.status) !== 'completed') {
      return {
        turn: failedTurn,
        messages: [],
      };
    }
    try {
      const result = parseAssistantHistoryImportResult(extractAgentMessageText(rawTurn.items));
      const importedMessages = this.importHistoryMessages(summary, rawTurn.id, result);
      const summaryText = buildAssistantHistoryImportSummary({
        attachments: execution.attachments,
        importedCount: importedMessages.length,
        notes: result.notes,
        target: summary.target ?? summary.title,
      });
      return {
        turn: {
          id: rawTurn.id,
          status: 'completed',
          error: null,
          items: [
            ...baseItems,
            {
              type: 'agentMessage',
              id: `${rawTurn.id}:assistant`,
              text: summaryText,
              phase: null,
              artifact: null,
            },
          ],
        },
        messages: importedMessages.map((message) => ({
          type: 'message.append',
          message,
        })),
      };
    } catch (error) {
      return {
        turn: {
          ...failedTurn,
          error: error instanceof Error ? error.message : 'Failed to import chat history',
        },
        messages: [],
      };
    }
  }

  private importHistoryMessages(
    summary: AssistantThreadSummary,
    turnId: string,
    parsedResult: ReturnType<typeof parseAssistantHistoryImportResult>,
  ) {
    const buffer = this.resolveImportBuffer(summary);
    const network = this.params.networks.get(buffer.networkId) as NetworkProfile | null;
    return parsedResult.messages
      .map((message, index) => normalizeImportedMessage(buffer, network, message, turnId, index))
      .filter((message): message is ImportedConversationMessage => message !== null)
      .sort(compareImportedMessages)
      .map(({ order: _order, ...message }) => this.params.conversations.appendMessage(message));
  }

  private resolveImportBuffer(summary: AssistantThreadSummary) {
    const existing = summary.bufferId ? this.params.conversations.getBuffer(summary.bufferId) : null;
    if (existing && existing.kind !== 'server') {
      return existing;
    }
    if (!summary.networkId || !summary.target || summary.target === 'server') {
      throw badRequest('Select a channel or private message buffer before importing history');
    }
    if (isChannelBufferTarget(summary.target)) {
      return this.params.conversations.upsertBuffer({
        networkId: summary.networkId,
        kind: 'channel',
        target: summary.target,
      });
    }
    return this.params.conversations.upsertQuery(summary.networkId, summary.target);
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

  private discardLiveThreadState(threadId: string) {
    for (const [turnId, live] of this.liveTurns.entries()) {
      if (live.threadId === threadId) {
        this.liveTurns.delete(turnId);
      }
    }
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
        attachments: [],
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
    return [...this.liveTurns.values()].map((live) => {
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
    });
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
  attachments,
  buffer,
  context,
  network,
  priorTranscript,
  prompt,
  task,
}: {
  attachments: AssistantTurnAttachmentInput[];
  buffer: BufferState | null;
  context: string;
  network: NetworkProfile | null;
  priorTranscript: string;
  prompt: string;
  task: AssistantTaskKind;
}) => {
  const items: Array<
    | { type: 'text'; text: string }
    | { type: 'image'; url: string }
  > = [{
    type: 'text',
    text: buildAssistantTurnInput({
      attachments: attachments.map(toAttachmentMetadata),
      buffer,
      context,
      network,
      priorTranscript,
      prompt,
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

const buildAssistantImportExecutionInput = ({
  attachments,
  buffer,
  network,
  prompt,
}: {
  attachments: AssistantTurnAttachmentInput[];
  buffer: BufferState;
  network: NetworkProfile | null;
  prompt: string;
}) => {
  const items: Array<{ type: 'text'; text: string }> = [{
    type: 'text',
    text: buildAssistantHistoryImportInput({
      attachments: attachments.map(toAttachmentMetadata),
      buffer,
      network,
      prompt,
    }),
  }];
  for (const attachment of attachments) {
    if (attachment.kind !== 'text') {
      throw badRequest('Only text log files can be imported into chat history');
    }
    items.push({
      type: 'text',
      text: [
        `Attached log file: ${attachment.name}`,
        `Mime type: ${attachment.mimeType}`,
        `Size: ${attachment.size} bytes`,
        '',
        attachment.text,
      ].join('\n'),
    });
  }
  return items;
};

const buildPendingUserItems = (turnId: string, execution: PendingExecution | undefined) =>
  execution ? [buildPendingUserMessage(turnId, execution)] : [];

const injectPendingUserMessage = (
  items: AssistantItem[],
  turnId: string,
  execution: PendingExecution | undefined,
) => {
  const filtered = items.filter((item) => item.type !== 'userMessage');
  return execution ? [buildPendingUserMessage(turnId, execution), ...filtered] : filtered;
};

const buildPendingUserMessage = (turnId: string, execution: PendingExecution): AssistantItem => ({
  type: 'userMessage',
  id: `${turnId}:user`,
  text: execution.prompt.trim(),
  attachments: execution.attachments,
});

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

type ImportedConversationMessage = MessageInput & {
  order: number;
};

const extractAgentMessageText = (items: RawThreadItem[]) => {
  const agentMessages = items.flatMap((item) =>
    item.type === 'agentMessage' && typeof item.text === 'string' && item.text.trim()
      ? [item.text]
      : []
  );
  const text = agentMessages.at(-1)?.trim();
  if (!text) {
    throw new Error('Assistant did not return import data');
  }
  return text;
};

const normalizeImportedMessage = (
  buffer: BufferState,
  network: NetworkProfile | null,
  message: AssistantHistoryImportResult['messages'][number],
  turnId: string,
  index: number,
): ImportedConversationMessage | null => {
  const body = message.body.trim();
  if (!body) {
    return null;
  }
  return {
    id: `import:${turnId}:${index}`,
    networkId: buffer.networkId,
    target: buffer.target,
    nick: message.self ? (message.nick ?? network?.nick ?? null) : message.nick,
    body,
    kind: 'line',
    self: message.self,
    ts: message.ts,
    order: index,
  };
};

const compareImportedMessages = (left: ImportedConversationMessage, right: ImportedConversationMessage) =>
  left.ts - right.ts || left.order - right.order;

const isChannelBufferTarget = (target: string) => /^[#&+!]/.test(target);

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
