import type { AssistantTurnAttachmentInput } from '../../shared/protocol.js';
import { useEffect, useMemo } from 'react';
import type { State } from './app-types.js';
import type { AssistantPanelProps } from './AssistantPanel.js';
import type { WorkspaceView } from './workspace-types.js';
import type { AssistantActionSet } from './useAppActions.js';
import type { AssistantThreadSummary } from '../../shared/protocol.js';

type AssistantControllerParams = {
  actions: AssistantActionSet;
  assistant: State['domain']['assistant'];
  assistantThreads: State['domain']['assistantThreads'];
  assistantUi: State['transient']['assistant'];
  workspace: WorkspaceView;
};

export const isAssistantThreadLoading = (
  selectedThreadId: string | null,
  loadingThreadId: string | null
) => selectedThreadId !== null && loadingThreadId === selectedThreadId;

export const shouldAutoLoadAssistantThread = (
  selectedThreadId: string | null,
  loadingThreadId: string | null,
  attemptedThreadId: string | null,
  selectedThread: State['domain']['assistantThreads'][string] | null
) => (
  selectedThreadId !== null
  && selectedThread === null
  && !isAssistantThreadLoading(selectedThreadId, loadingThreadId)
  && attemptedThreadId !== selectedThreadId
);

export const isAssistantBusy = (
  selectedThreadSummary: AssistantThreadSummary | null,
  selectedThread: State['domain']['assistantThreads'][string] | null
) => selectedThreadSummary?.turnStatus === 'inProgress'
  || !!selectedThread?.turns.some((turn) => turn.status === 'inProgress');

const assistantImportIntentVerbPattern = /\b(import|merge|add|append|insert|load|ingest|update|edit)\b/i;
const assistantImportIntentTargetPattern = /\b(history|messages|transcript|log|logs|buffer)\b/i;

export const shouldImportAssistantPrompt = (
  prompt: string,
  attachments: AssistantTurnAttachmentInput[],
  canImportHistory: boolean,
) => {
  const text = prompt.trim();
  return canImportHistory
    && text.length > 0
    && attachments.length > 0
    && attachments.every((attachment) => attachment.kind === 'text')
    && assistantImportIntentVerbPattern.test(text)
    && assistantImportIntentTargetPattern.test(text);
};

const askThreadsForWorkspace = (
  bufferId: string | null,
  threads: State['domain']['assistant']['threads']
) => {
  const visibleThreads = bufferId
    ? threads.filter((thread) => thread.bufferId === bufferId && thread.task === 'ask')
    : threads.filter((thread) => thread.task === 'ask');
  return [...visibleThreads].sort((left, right) => right.updatedAt - left.updatedAt);
};

export function useAssistantController({
  actions,
  assistant,
  assistantThreads,
  assistantUi,
  workspace,
}: AssistantControllerParams): AssistantPanelProps {
  const selectedBufferId = workspace.selectedBuffer?.id ?? null;
  const contextKey = selectedBufferId ?? 'no-buffer';
  const threads = useMemo(
    () => askThreadsForWorkspace(selectedBufferId, assistant.threads),
    [assistant.threads, selectedBufferId]
  );
  const preferredThreadId = assistantUi.selectedThreadId ?? assistant.activeThreadId ?? null;
  const selectedThreadSummary = (
    preferredThreadId
      ? threads.find((thread) => thread.id === preferredThreadId) ?? null
      : null
  ) ?? threads[0] ?? null;
  const selectedThreadId = selectedThreadSummary?.id ?? null;
  const selectedThread = selectedThreadId ? assistantThreads[selectedThreadId] ?? null : null;
  const loading = isAssistantThreadLoading(selectedThreadId, assistantUi.loadingThreadId);
  const shouldLoadThread = shouldAutoLoadAssistantThread(
    selectedThreadId,
    assistantUi.loadingThreadId,
    assistantUi.attemptedThreadId,
    selectedThread,
  );
  const busy = isAssistantBusy(selectedThreadSummary, selectedThread);
  const canImportHistory = workspace.selectedBuffer?.kind === 'channel' || workspace.selectedBuffer?.kind === 'query';

  useEffect(() => {
    if (!shouldLoadThread || !selectedThreadId) {
      return;
    }
    void actions.loadAssistantThread(selectedThreadId);
  }, [actions, selectedThreadId, shouldLoadThread]);

  return useMemo(() => ({
    assistant,
    canImportHistory,
    canClearHistory: threads.length > 0,
    contextKey,
    contextEmpty: selectedBufferId === null,
    loading,
    busy,
    thread: selectedThread,
    onClearHistory: async () => actions.clearAssistantThreads(threads.map((thread) => thread.id)),
    onStop: async () => selectedThreadId ? actions.interruptAssistantThread(selectedThreadId) : false,
    onSubmitPrompt: async (prompt, attachments: AssistantTurnAttachmentInput[]) => {
      const text = prompt.trim();
      if (!text) {
        return false;
      }
      const threadId = selectedThreadId ?? (await actions.createAssistantThread('ask'))?.id ?? null;
      if (!threadId) {
        return false;
      }
      return shouldImportAssistantPrompt(text, attachments, canImportHistory)
        ? actions.importAssistantHistory(threadId, text, attachments)
        : actions.startAssistantTurn(threadId, text, attachments);
    },
    onImportHistory: async (prompt, attachments: AssistantTurnAttachmentInput[]) => {
      const threadId = selectedThreadId ?? (await actions.createAssistantThread('ask'))?.id ?? null;
      return threadId ? actions.importAssistantHistory(threadId, prompt.trim(), attachments) : false;
    },
  }), [
    actions.createAssistantThread,
    actions.clearAssistantThreads,
    actions.importAssistantHistory,
    actions.interruptAssistantThread,
    actions.startAssistantTurn,
    assistant,
    busy,
    canImportHistory,
    contextKey,
    loading,
    selectedThread,
    selectedThreadId,
    selectedBufferId,
    threads,
  ]);
}
