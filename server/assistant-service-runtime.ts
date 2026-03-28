import type {
  AssistantActiveBuffer,
  AssistantSnapshot,
  AssistantTaskKind,
  AssistantThread,
  AssistantThreadScope,
  AssistantThreadSummary,
  AssistantTurn,
  AssistantTurnAttachmentInput,
  ServerMessage,
} from '../shared/protocol.js';
import { canonicalizeAssistantText } from '../shared/assistant-document.js';
import {
  assistantBaseInstructions,
  getAssistantOutputSchema,
} from './assistant-prompts.js';
import {
  buildAssistantExecutionInput,
  resolveActiveBuffer,
  resolveAskContext,
  resolveBufferTaskContext,
} from './assistant-service-context.js';
import {
  assistantSandboxCwd,
  assistantThreadSandbox,
  assistantTurnSandboxPolicy,
  localAssistantTurnIdPrefix,
  type LiveTurnState,
  type PendingExecution,
  type QueuedExecution,
  type RawThreadItem,
  type RawThreadReadResponse,
  type RawThreadStartResponse,
  type RawTurn,
  isLocalAssistantThreadId,
  staleTurnFailureMessage,
  toTurnError,
  toTurnStatus,
} from './assistant-service-shared.js';
import {
  buildAssistantTranscript,
  buildPendingTurn,
  buildPendingUserItems,
  injectPendingUserMessage,
  mapItem,
  mapTurn,
  normalizeStoredAssistantTurns,
  toAttachmentMetadata,
  upsertTurn,
  upsertTurnItem,
} from './assistant-service-turns.js';
import type {
  RuntimeAssistantStore,
  RuntimeConversationStore,
  RuntimeNetworkStore,
} from './runtime-store-ports.js';
import { randomUUID } from 'node:crypto';
import { badRequest } from './app-error.js';

type AssistantServiceRuntimeParams = {
  assistant: RuntimeAssistantStore;
  conversations: RuntimeConversationStore;
  networks: RuntimeNetworkStore;
  callAppServer: <T>(method: string, params?: unknown) => Promise<T>;
  publish: (message: ServerMessage | readonly ServerMessage[]) => void;
  runAppServerTask: (task: () => Promise<void>) => void;
  snapshot: () => AssistantSnapshot;
};

export class AssistantServiceRuntime {
  private readonly pendingStarts = new Map<string, QueuedExecution>();
  private readonly executionThreads = new Map<string, PendingExecution>();
  private readonly interruptRequests = new Set<string>();
  private readonly liveTurns = new Map<string, LiveTurnState>();

  constructor(private readonly params: AssistantServiceRuntimeParams) {}

  async readThread(summary: AssistantThreadSummary): Promise<AssistantThread> {
    const localTurns = this.params.assistant.getThreadTurns(summary.id) ?? [];
    if (localTurns.length > 0 || isLocalAssistantThreadId(summary.id)) {
      const normalizedTurns = normalizeStoredAssistantTurns(summary.task, localTurns);
      if (normalizedTurns.changed) {
        this.params.assistant.saveThreadTurns(summary.id, normalizedTurns.turns);
      }
      return {
        ...summary,
        turns: normalizedTurns.turns,
      };
    }
    return {
      ...summary,
      turns: await this.importLegacyThreadTurns(summary),
    };
  }

  async startExecution(input: {
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
    const queuedExecution: QueuedExecution = {
      kind: 'turn',
      activeBuffer: resolveActiveBuffer(this.params.conversations, input.activeBufferId ?? null),
      attachments: (input.attachments ?? []).map(toAttachmentMetadata),
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

  async interruptThread(threadId: string) {
    const live = this.findLiveTurn(threadId);
    if (live?.executionThreadId && live.remoteTurnId) {
      await this.params.callAppServer('turn/interrupt', {
        threadId: live.executionThreadId,
        turnId: live.remoteTurnId,
      });
      return;
    }
    if (live || this.hasPendingExecution(threadId)) {
      this.interruptRequests.add(threadId);
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
    await this.params.callAppServer('turn/interrupt', {
      threadId: live.executionThreadId,
      turnId: live.remoteTurnId,
    });
  }

  clearThreadState(threadId: string) {
    this.pendingStarts.delete(threadId);
    for (const [turnId, live] of this.liveTurns.entries()) {
      if (live.threadId === threadId) {
        this.liveTurns.delete(turnId);
      }
    }
  }

  resetTransientState() {
    this.pendingStarts.clear();
    this.executionThreads.clear();
    this.interruptRequests.clear();
    this.liveTurns.clear();
  }

  reconcilePersistedInProgressThreads() {
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

  failInProgressTurns(error: Error | null): ServerMessage[] {
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

  handleTurnStarted(params: { threadId: string; turn: RawTurn }) {
    const threadId = this.resolveExecutionThreadOwner(params.threadId);
    const summary = this.params.assistant.getThread(threadId);
    if (!summary) {
      if (this.interruptRequests.delete(threadId)) {
        this.params.runAppServerTask(async () => {
          await this.params.callAppServer('turn/interrupt', {
            threadId: params.threadId,
            turnId: params.turn.id,
          });
        });
      }
      return;
    }
    const execution = this.executionThreads.get(params.threadId);
    const localTurnId = execution?.localTurnId ?? this.findLocalTurnId(params.threadId, params.turn.id) ?? params.turn.id;
    const mapped = mapTurn(summary.task, params.turn);
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
    this.params.publish({
      type: 'assistant.turn.started',
      threadId,
      turn,
    });
    if (this.interruptRequests.delete(threadId)) {
      this.params.runAppServerTask(async () => {
        await this.params.callAppServer('turn/interrupt', {
          threadId: params.threadId,
          turnId: params.turn.id,
        });
      });
    }
  }

  async handleTurnCompleted(params: { threadId: string; turn: RawTurn }) {
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
    const mapped = mapTurn(summary.task, params.turn);
    const next = live
      ? {
          ...live.turn,
          status: toTurnStatus(params.turn.status),
          error: toTurnError(params.turn.error),
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
    this.params.publish([
      {
        type: 'assistant.turn.completed',
        threadId,
        turn: next,
      },
      this.snapshotMessage(),
    ]);
  }

  handleItemStarted(params: { threadId: string; turnId: string; item: RawThreadItem }) {
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
    const item = mapItem(summary.task, params.item);
    live.turn.items = upsertTurnItem(live.turn.items, item);
    live.executionThreadId = execution?.executionThreadId ?? params.threadId;
    live.remoteTurnId = params.turnId;
    this.liveTurns.set(localTurnId, live);
    this.persistTurn(threadId, live.turn);
    this.params.publish({
      type: 'assistant.item.started',
      threadId,
      turnId: localTurnId,
      item,
    });
  }

  handleItemDelta(params: { threadId: string; turnId: string; itemId: string; delta: string }) {
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
    this.params.publish({
      type: 'assistant.item.delta',
      threadId: live.threadId,
      turnId: localTurnId,
      itemId: params.itemId,
      delta: params.delta,
    });
  }

  handleItemCompleted(params: { threadId: string; turnId: string; item: RawThreadItem }) {
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
    const item = mapItem(summary.task, params.item);
    live.turn.items = upsertTurnItem(live.turn.items, item);
    this.persistTurn(threadId, live.turn);
    this.params.publish({
      type: 'assistant.item.completed',
      threadId,
      turnId: localTurnId,
      item,
    });
  }

  private async importLegacyThreadTurns(summary: AssistantThreadSummary) {
    try {
      const response = await this.params.callAppServer<RawThreadReadResponse>('thread/read', {
        threadId: summary.id,
        includeTurns: true,
      });
      const turns = Array.isArray(response.thread?.turns)
        ? response.thread.turns.map((turn) => mapTurn(summary.task, turn))
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
    const execution = await this.params.callAppServer<RawThreadStartResponse>(
      'thread/start',
      buildThreadStartParams(summary.model),
    );
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
          const askContext = resolveAskContext({
            activeBuffer: queuedExecution.activeBuffer,
            priorTurns,
            prompt: queuedExecution.prompt,
            conversations: this.params.conversations,
          });
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
          const context = resolveBufferTaskContext({
            bufferId: currentSummary.bufferId,
            networkId: currentSummary.networkId,
            scope: currentSummary.scope,
            target: currentSummary.target,
            prompt: queuedExecution.prompt,
            task: currentSummary.task,
            conversations: this.params.conversations,
            networks: this.params.networks,
          });
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
    await this.params.callAppServer('turn/start', {
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
    this.params.publish([
      {
        type: 'assistant.turn.completed',
        threadId,
        turn: failedTurn,
      },
      this.snapshotMessage(),
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
    if (this.pendingStarts.has(threadId)) {
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

  private snapshotMessage() {
    return {
      type: 'assistant.snapshot' as const,
      assistant: this.params.snapshot(),
    };
  }
}

const buildThreadStartParams = (model: string) => ({
  model,
  modelProvider: 'openai',
  cwd: assistantSandboxCwd,
  approvalPolicy: 'never',
  sandbox: assistantThreadSandbox,
  personality: 'pragmatic',
  serviceName: 'pulsete_assistant',
  baseInstructions: assistantBaseInstructions,
});
