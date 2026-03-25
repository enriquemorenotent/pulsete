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

export const getAskThreadsForWorkspace = (
  bufferId: string | null,
  threads: State['domain']['assistant']['threads']
) => {
  const visibleThreads = bufferId
    ? threads.filter((thread) => thread.bufferId === bufferId && thread.task === 'ask')
    : threads.filter((thread) => thread.task === 'ask');
  return [...visibleThreads].sort((left, right) => right.updatedAt - left.updatedAt);
};

const getAssistantContextTitle = (workspace: WorkspaceView) =>
  workspace.selectedBuffer ? workspace.headerTitle : 'this buffer';

const getAssistantContextSubtitle = (workspace: WorkspaceView) =>
  workspace.selectedBuffer ? workspace.headerSubtitle : '';

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
    () => getAskThreadsForWorkspace(selectedBufferId, assistant.threads),
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

  useEffect(() => {
    if (!shouldLoadThread || !selectedThreadId) {
      return;
    }
    void actions.loadAssistantThread(selectedThreadId);
  }, [actions, selectedThreadId, shouldLoadThread]);

  return useMemo(() => ({
    assistant,
    contextTitle: getAssistantContextTitle(workspace),
    contextSubtitle: getAssistantContextSubtitle(workspace),
    contextKey,
    contextEmpty: selectedBufferId === null,
    loading,
    busy,
    thread: selectedThread,
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
      return actions.startAssistantTurn(threadId, text, attachments);
    },
    onOpenChannel: actions.openMentionedChannel,
  }), [
    actions.createAssistantThread,
    actions.interruptAssistantThread,
    actions.startAssistantTurn,
    actions.openMentionedChannel,
    assistant,
    busy,
    contextKey,
    loading,
    selectedThread,
    selectedThreadId,
    selectedBufferId,
    threads,
    workspace,
  ]);
}
