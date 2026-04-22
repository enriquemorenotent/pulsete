import { useEffect, useMemo } from 'react';
import type { State } from './app-types.js';
import type { AssistantPanelProps } from './AssistantPanel.js';
import type { WorkspaceView } from './workspace-types.js';
import type { AssistantActionSet } from './useAppActions.js';
import type { AssistantThread, AssistantThreadSummary, AssistantTurnAttachmentInput } from '../../shared/protocol.js';
import { getAskThreadForBuffer, getAskThreadsForBuffer } from './assistant-thread-selection.js';

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

const getAssistantContextKey = (
  threadId: string | null,
  bufferId: string | null,
) => threadId ?? bufferId ?? 'assistant-chat';

const getAssistantContextTitle = () => 'Chat';

const getAssistantResolvedSubjectLabel = (thread: AssistantThread | null) => {
  if (!thread) {
    return null;
  }
  for (let index = thread.turns.length - 1; index >= 0; index -= 1) {
    const resolvedSubject = thread.turns[index]?.resolvedSubject;
    if (resolvedSubject?.title) {
      return resolvedSubject.title;
    }
  }
  return null;
};

const hasPendingAssistantSubject = (thread: AssistantThread | null) => {
  const latestTurn = thread?.turns.at(-1) ?? null;
  return !!latestTurn?.routing?.pendingClarification;
};

const getAssistantContextSubtitle = (
  workspace: WorkspaceView,
  resolvedSubjectLabel: string | null,
  subjectPending: boolean,
) => {
  const sections: string[] = [];
  if (workspace.selectedBuffer) {
    sections.push(`Current buffer: ${workspace.headerTitle}.`);
  } else {
    sections.push('No current buffer selected.');
  }
  if (resolvedSubjectLabel) {
    sections.push(`Assistant subject: ${resolvedSubjectLabel}.`);
  } else if (subjectPending) {
    sections.push('Assistant subject: awaiting confirmation.');
  } else if (workspace.selectedBuffer) {
    sections.push('This assistant chat is scoped to the current buffer.');
  } else {
    sections.push('The assistant will only use what you type or attach until a subject is resolved.');
  }
  return sections.join(' ');
};

const getAssistantBufferLabel = (workspace: WorkspaceView) =>
  workspace.selectedBuffer ? workspace.headerTitle : null;

export function useAssistantController({
  actions,
  assistant,
  assistantThreads,
  assistantUi,
  workspace,
}: AssistantControllerParams): AssistantPanelProps {
  const selectedBufferId = workspace.selectedBuffer?.id ?? null;
  const selectedThreadSummary = useMemo(
    () => getAskThreadForBuffer(assistant.threads, selectedBufferId),
    [assistant.threads, selectedBufferId],
  );
  const bufferAskThreadIds = useMemo(
    () => getAskThreadsForBuffer(assistant.threads, selectedBufferId).map((thread) => thread.id),
    [assistant.threads, selectedBufferId],
  );
  const selectedThreadId = selectedThreadSummary?.id ?? null;
  const selectedThread = selectedThreadId ? assistantThreads[selectedThreadId] ?? null : null;
  const resolvedSubjectLabel = getAssistantResolvedSubjectLabel(selectedThread);
  const subjectPending = hasPendingAssistantSubject(selectedThread);
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
    activeBufferLabel: getAssistantBufferLabel(workspace),
    assistant,
    busy,
    contextKey: getAssistantContextKey(selectedThreadId, selectedBufferId),
    contextSubtitle: getAssistantContextSubtitle(workspace, resolvedSubjectLabel, subjectPending),
    contextTitle: getAssistantContextTitle(),
    loading,
    resolvedSubjectLabel,
    subjectPending,
    thread: selectedThread,
    onNewChat: async () => {
      if (bufferAskThreadIds.length > 0) {
        const cleared = await actions.clearAssistantThreads(bufferAskThreadIds);
        if (!cleared) {
          return false;
        }
      }
      return !!(await actions.createAssistantThread('ask'));
    },
    onOpenChannel: actions.openMentionedChannel,
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
      return actions.startAssistantTurn(threadId, text, attachments, selectedBufferId);
    },
  }), [
    actions.createAssistantThread,
    actions.interruptAssistantThread,
    actions.loadAssistantThread,
    actions.openMentionedChannel,
    actions.startAssistantTurn,
    assistant,
    busy,
    bufferAskThreadIds,
    actions.clearAssistantThreads,
    resolvedSubjectLabel,
    loading,
    selectedBufferId,
    selectedThread,
    selectedThreadId,
    subjectPending,
    workspace,
  ]);
}
