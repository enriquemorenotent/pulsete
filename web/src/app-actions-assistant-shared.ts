import type {
  AssistantAttachmentMetadata,
  AssistantSnapshot,
  AssistantThreadSummary,
  AssistantTurn,
  AssistantTurnAttachmentInput,
} from '../../shared/protocol.js';
import type { AppActionContext } from './app-actions-types.js';
import { createAppMutationExecutor } from './app-mutation.js';

export type AssistantActionParams = Pick<
  AppActionContext,
  'applyServerMessages' | 'dispatch' | 'getSession' | 'setDraft' | 'updateBanner'
>;

export type AssistantActionContextShared = AssistantActionParams & {
  executeMutation: ReturnType<typeof createAppMutationExecutor>;
  syncSnapshot: (patch: Partial<AssistantSnapshot>) => void;
};

export const createAssistantActionContext = (
  params: AssistantActionParams,
): AssistantActionContextShared => {
  const executeMutation = createAppMutationExecutor({
    applyServerMessages: params.applyServerMessages,
    updateBanner: params.updateBanner,
  });
  return {
    ...params,
    executeMutation,
    syncSnapshot: (patch) => {
      const { state } = params.getSession();
      params.dispatch({
        type: 'assistant-snapshot',
        assistant: patchAssistantSnapshot(state.domain.assistant, patch),
      });
    },
  };
};

export const isDraftTargetAvailable = (
  session: ReturnType<AssistantActionParams['getSession']>,
) =>
  session.workspace.composerMode === 'normal'
  && session.workspace.selectedBuffer?.kind !== 'server';

export const upsertThreadSummary = (
  threads: AssistantThreadSummary[],
  nextThread: AssistantThreadSummary,
) => [...threads.filter((thread) => thread.id !== nextThread.id), nextThread]
  .sort((left, right) => right.updatedAt - left.updatedAt);

export const markAssistantThreadStopped = (
  dispatch: AssistantActionParams['dispatch'],
  threadId: string,
) => {
  dispatch({ type: 'assistant-thread-stop-requested', threadId });
};

export const buildOptimisticAssistantTurn = (
  turnId: string,
  prompt: string,
  attachments: AssistantTurnAttachmentInput[],
): AssistantTurn => ({
  id: turnId,
  status: 'inProgress',
  error: null,
  items: [{
    type: 'userMessage',
    id: `${turnId}:user`,
    text: prompt.trim(),
    attachments: toAttachmentMetadata(attachments),
  }],
});

export const createAssistantTurnId = () => {
  const suffix = globalThis.crypto?.randomUUID?.()
    ?? `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `assistant-turn:${suffix}`;
};

const patchAssistantSnapshot = (
  current: AssistantSnapshot,
  patch: Partial<AssistantSnapshot>,
): AssistantSnapshot => ({
  ...current,
  ...patch,
});

const toAttachmentMetadata = (
  attachments: AssistantTurnAttachmentInput[],
): AssistantAttachmentMetadata[] =>
  attachments.map(({ id, kind, mimeType, name, size }) => ({
    id,
    kind,
    mimeType,
    name,
    size,
  }));
