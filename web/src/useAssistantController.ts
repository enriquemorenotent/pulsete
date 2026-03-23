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

export const assistantContextLabel = (workspace: WorkspaceView) =>
  workspace.selectedBuffer
    ? `${workspace.selectedNetwork?.name ?? workspace.selectedBuffer.networkId} · ${workspace.selectedBuffer.target} · last 50 messages`
    : 'No selected buffer · no recent message context';

export const isAssistantBusy = (
  selectedThreadSummary: AssistantThreadSummary | null,
  selectedThread: State['domain']['assistantThreads'][string] | null
) => selectedThreadSummary?.turnStatus === 'inProgress'
  || !!selectedThread?.turns.some((turn) => turn.status === 'inProgress');

const askThreadsForWorkspace = (
  workspace: WorkspaceView,
  threads: State['domain']['assistant']['threads']
) => {
  const bufferId = workspace.selectedBuffer?.id;
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
  const threads = useMemo(
    () => askThreadsForWorkspace(workspace, assistant.threads),
    [assistant.threads, workspace.selectedBuffer?.id]
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

  useEffect(() => {
    if (!shouldLoadThread || !selectedThreadId) {
      return;
    }
    void actions.loadAssistantThread(selectedThreadId);
  }, [actions, selectedThreadId, shouldLoadThread]);

  return useMemo(() => ({
    assistant,
    contextLabel: assistantContextLabel(workspace),
    contextEmpty: !workspace.selectedBuffer,
    loading,
    busy,
    thread: selectedThread,
    onSubmitPrompt: async (prompt) => {
      const text = prompt.trim();
      if (!text) {
        return false;
      }
      const threadId = selectedThreadId ?? (await actions.createAssistantThread('ask'))?.id ?? null;
      return threadId ? actions.startAssistantTurn(threadId, text) : false;
    },
    onInterruptTurn: async (turnId) => selectedThreadId ? actions.interruptAssistantTurn(selectedThreadId, turnId) : false,
  }), [
    actions.createAssistantThread,
    actions.interruptAssistantTurn,
    actions.startAssistantTurn,
    assistant,
    busy,
    loading,
    selectedThread,
    selectedThreadId,
    workspace,
  ]);
}
