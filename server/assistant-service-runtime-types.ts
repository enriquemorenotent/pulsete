import type {
  BufferState,
  NetworkProfile,
  AssistantSnapshot,
  ServerMessage,
  AssistantThread,
  AssistantThreadSummary,
  AssistantTurnAttachmentInput,
} from '../shared/protocol.js';
import type { AssistantStateMutation } from './assistant-actions.js';
import type {
  LiveTurnState,
  PendingExecution,
  QueuedExecution,
  RawThreadItem,
  RawTurn,
} from './assistant-service-shared.js';
import type {
  RuntimeAssistantStore,
  RuntimeConversationStore,
  RuntimeNetworkStore,
} from './runtime-store-ports.js';

export type AssistantServiceRuntimeParams = {
  assistant: RuntimeAssistantStore;
  conversations: RuntimeConversationStore;
  networks: RuntimeNetworkStore;
  callAppServer: <T>(method: string, params?: unknown) => Promise<T>;
  publish: (message: ServerMessage | readonly ServerMessage[]) => void;
  runAppServerTask: (task: () => Promise<void>) => void;
  snapshot: () => AssistantSnapshot;
  applyAssistantMutation?: (mutation: AssistantStateMutation) => {
    messages: readonly ServerMessage[];
  } | null;
};

export type AssistantServiceRuntimeState = {
  pendingStarts: Map<string, QueuedExecution>;
  executionThreads: Map<string, PendingExecution>;
  interruptRequests: Set<string>;
  liveTurns: Map<string, LiveTurnState>;
};

export type AssistantServiceRuntimeContext = {
  params: AssistantServiceRuntimeParams;
  state: AssistantServiceRuntimeState;
};

export type AssistantStartExecutionInput = {
  activeBufferId?: string | null;
  attachments?: AssistantTurnAttachmentInput[];
  clientTurnId?: string;
  prompt: string;
  threadId: string;
};

export type {
  AssistantThread,
  AssistantThreadSummary,
  RawThreadItem,
  RawTurn,
};
