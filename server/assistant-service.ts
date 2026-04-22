import type {
  AssistantTaskKind,
  AssistantThread,
  AssistantThreadScope,
  AssistantTurnAttachmentInput,
  ServerMessage,
} from '../shared/protocol.js';
import { randomUUID } from 'node:crypto';
import { badRequest } from './app-error.js';
import type { AssistantStateMutation } from './assistant-actions.js';
import { AssistantAppServer } from './assistant-app-server.js';
import { AssistantServiceAppState } from './assistant-service-app-state.js';
import { handleAssistantServiceNotification } from './assistant-service-notifications.js';
import { buildAssistantThreadTitle } from './assistant-prompts.js';
import { AssistantServiceRuntime } from './assistant-service-runtime.js';
import { localAssistantThreadIdPrefix } from './assistant-service-shared.js';
import type {
  RuntimeAssistantStore,
  RuntimeConversationStore,
  RuntimeNetworkStore,
} from './runtime-store-ports.js';

type AssistantServiceParams = {
  assistant: RuntimeAssistantStore;
  conversations: RuntimeConversationStore;
  networks: RuntimeNetworkStore;
  publish: (message: ServerMessage | readonly ServerMessage[]) => void;
  autoStart?: boolean;
  applyAssistantMutation?: (mutation: AssistantStateMutation) => {
    messages: readonly ServerMessage[];
  } | null;
};

export class AssistantService {
  private readonly appServer: AssistantAppServer;
  private readonly runtime: AssistantServiceRuntime;
  private readonly appState: AssistantServiceAppState;

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
      applyAssistantMutation: params.applyAssistantMutation,
    });
    this.appState = new AssistantServiceAppState({
      assistant: params.assistant,
      callAppServer: (method, callParams) => this.appServer.call(method, callParams),
      publishSnapshot: () => this.publishSnapshot(),
    });
    this.appServer.on('ready', () => {
      this.runAppServerTask(() => this.appState.handleReady());
    });
    this.appServer.on('unavailable', (error) => {
      this.handleUnavailable(error);
    });
    this.appServer.on('notification', (message) => {
      this.runAppServerTask(() =>
        handleAssistantServiceNotification({
          state: this.appState,
          runtime: this.runtime,
          method: message.method,
          params: message.params,
        }),
      );
    });
    this.runtime.reconcilePersistedInProgressThreads();
  }

  close() {
    this.appServer.close();
  }

  snapshot() {
    return this.appState.snapshot();
  }

  async startChatgptLogin() {
    return this.appState.startChatgptLogin();
  }

  async cancelLogin(loginId: string) {
    await this.appState.cancelLogin(loginId);
  }

  async logout() {
    await this.appState.logout();
  }

  async createThread(input: {
    bufferId: string | null;
    scope?: AssistantThreadScope;
    task: AssistantTaskKind;
    model?: string;
  }) {
    const model = this.appState.sanitizeModel(input.model);
    const scope = this.resolveAssistantThreadScope(input.task, input.scope);
    const buffer =
      scope === 'buffer' && input.bufferId
        ? this.params.conversations.getBuffer(input.bufferId)
        : null;
    if (scope === 'buffer' && !buffer) {
      throw badRequest(
        input.task === 'ask'
          ? 'Select a channel or private message before starting an assistant chat'
          : 'Select a buffer before starting a buffer-scoped assistant thread',
      );
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

  updatePreferences(input: { defaultModel?: string; activeThreadId?: string | null }) {
    return this.appState.updatePreferences(input);
  }

  private get auth() {
    return this.appState.getAuth();
  }

  private set auth(auth: ReturnType<AssistantServiceAppState['getAuth']>) {
    this.appState.setAuthForTesting(auth);
  }

  private async handleLoginCompleted(params: { loginId?: string; success: boolean; error?: string | null }) { await this.appState.handleLoginCompleted(params); }

  private handleTurnStarted(params: { threadId: string; turn: Parameters<AssistantServiceRuntime['handleTurnStarted']>[0]['turn'] }) { this.runtime.handleTurnStarted(params); }

  private async handleTurnCompleted(params: { threadId: string; turn: Parameters<AssistantServiceRuntime['handleTurnCompleted']>[0]['turn'] }) { await this.runtime.handleTurnCompleted(params); }

  private handleItemStarted(params: Parameters<AssistantServiceRuntime['handleItemStarted']>[0]) {
    this.runtime.handleItemStarted(params);
  }

  private handleItemDelta(params: Parameters<AssistantServiceRuntime['handleItemDelta']>[0]) {
    this.runtime.handleItemDelta(params);
  }

  private handleItemCompleted(params: Parameters<AssistantServiceRuntime['handleItemCompleted']>[0]) {
    this.runtime.handleItemCompleted(params);
  }

  private resolveAssistantThreadScope(task: AssistantTaskKind, scope: AssistantThreadScope | undefined): AssistantThreadScope {
    return task === 'ask' ? 'buffer' : (scope ?? 'buffer');
  }

  private runAppServerTask(task: () => Promise<void>) {
    void task().catch((error) => {
      this.appState.markTaskError(error);
    });
  }

  private handleUnavailable(error: Error | null) {
    const failedMessages = this.runtime.failInProgressTurns(error);
    this.runtime.resetTransientState();
    this.appState.handleUnavailable(error);
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

  private requireThread(threadId: string) {
    const thread = this.params.assistant.getThread(threadId);
    if (!thread) {
      throw new Error(`Unknown assistant thread: ${threadId}`);
    }
    return thread;
  }

  private publishSnapshot() { this.publish({ type: 'assistant.snapshot', assistant: this.snapshot() }); }

  private publish(message: ServerMessage | readonly ServerMessage[]) {
    this.params.publish(message);
  }
}
