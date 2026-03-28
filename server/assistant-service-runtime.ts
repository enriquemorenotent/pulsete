import type {
  AssistantThread,
  AssistantThreadSummary,
  RawThreadItem,
  RawTurn,
} from './assistant-service-runtime-types.js';
import {
  handleItemCompleted,
  handleItemDelta,
  handleItemStarted,
  handleTurnCompleted,
  handleTurnStarted,
} from './assistant-service-runtime-events.js';
import {
  interruptThread,
  interruptTurn,
} from './assistant-service-runtime-interrupts.js';
import {
  readThread,
  clearThreadState,
  failInProgressTurns,
  reconcilePersistedInProgressThreads,
  resetTransientState,
} from './assistant-service-runtime-recovery.js';
import {
  startExecution,
} from './assistant-service-runtime-execution.js';
import type {
  AssistantStartExecutionInput,
  AssistantServiceRuntimeParams,
  AssistantServiceRuntimeState,
} from './assistant-service-runtime-types.js';

export class AssistantServiceRuntime {
  private readonly state: AssistantServiceRuntimeState = {
    pendingStarts: new Map(),
    executionThreads: new Map(),
    interruptRequests: new Set(),
    liveTurns: new Map(),
  };

  constructor(private readonly params: AssistantServiceRuntimeParams) {}

  async readThread(summary: AssistantThreadSummary): Promise<AssistantThread> {
    return readThread(this.context(), summary);
  }

  async startExecution(input: AssistantStartExecutionInput) {
    return startExecution(this.context(), input);
  }

  async interruptThread(threadId: string) {
    return interruptThread(this.context(), threadId);
  }

  async interruptTurn(threadId: string, turnId: string) {
    return interruptTurn(this.context(), threadId, turnId);
  }

  clearThreadState(threadId: string) {
    clearThreadState(this.context(), threadId);
  }

  resetTransientState() {
    resetTransientState(this.context());
  }

  reconcilePersistedInProgressThreads() {
    reconcilePersistedInProgressThreads(this.context());
  }

  failInProgressTurns(error: Error | null) {
    return failInProgressTurns(this.context(), error);
  }

  handleTurnStarted(params: { threadId: string; turn: RawTurn }) {
    handleTurnStarted(this.context(), params);
  }

  async handleTurnCompleted(params: { threadId: string; turn: RawTurn }) {
    await handleTurnCompleted(this.context(), params);
  }

  handleItemStarted(params: { threadId: string; turnId: string; item: RawThreadItem }) {
    handleItemStarted(this.context(), params);
  }

  handleItemDelta(params: { threadId: string; turnId: string; itemId: string; delta: string }) {
    handleItemDelta(this.context(), params);
  }

  handleItemCompleted(params: { threadId: string; turnId: string; item: RawThreadItem }) {
    handleItemCompleted(this.context(), params);
  }

  private context() {
    return {
      params: this.params,
      state: this.state,
    };
  }
}
