import { type DragEvent, useEffect, useMemo, useState } from 'react';
import type { AssistantTurnAttachmentInput } from '../../shared/protocol.js';
import {
  assistantFileInputAccept,
  hasAssistantDroppedFiles,
  listAssistantDroppedFiles,
  prepareAssistantAttachments,
} from './assistant-attachments.js';
import { buildAssistantConversation } from './assistant-panel-conversation.js';
import {
  resolveAssistantPanelMetaSegments,
  resolveAssistantPanelStatusState,
  shouldSubmitAssistantPrompt,
} from './assistant-panel-status.js';
import type { AssistantPanelProps } from './assistant-panel-types.js';
import { AssistantPanelComposer } from './AssistantPanelComposer.js';
import { AssistantPanelConversation } from './AssistantPanelConversation.js';
import { AssistantPanelHeader } from './AssistantPanelHeader.js';

export type { AssistantPanelProps } from './assistant-panel-types.js';
export { shouldSubmitAssistantPrompt } from './assistant-panel-status.js';

export function AssistantPanel(props: AssistantPanelProps) {
  const [prompt, setPrompt] = useState('');
  const [attachments, setAttachments] = useState<AssistantTurnAttachmentInput[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [dropActive, setDropActive] = useState(false);
  const [dropDepth, setDropDepth] = useState(0);
  const conversation = useMemo(() => buildAssistantConversation(props.thread), [props.thread]);
  const assistantReady = props.assistant.serviceStatus === 'ready' && !!props.assistant.auth.account;
  const canAttachFiles = assistantReady && !props.busy;
  const panelTitle = props.activeBufferLabel ?? props.contextTitle;
  const promptTarget = props.activeBufferLabel ?? null;
  const statusState = resolveAssistantPanelStatusState({
    assistantReady,
    authLastError: props.assistant.auth.lastError,
    serviceError: props.assistant.serviceError,
    serviceStatus: props.assistant.serviceStatus,
  });
  const metaSegments = resolveAssistantPanelMetaSegments({
    activeBufferLabel: props.activeBufferLabel,
    resolvedSubjectLabel: props.resolvedSubjectLabel,
    subjectPending: props.subjectPending,
  });

  useEffect(() => {
    setPrompt('');
    setAttachments([]);
    setAttachmentError(null);
    setDropActive(false);
    setDropDepth(0);
  }, [props.contextKey]);

  useEffect(() => {
    if (canAttachFiles) {
      return;
    }
    setDropActive(false);
    setDropDepth(0);
  }, [canAttachFiles]);

  const attachFiles = async (files: File[]) => {
    if (files.length === 0) {
      return;
    }
    try {
      const prepared = await prepareAssistantAttachments(files, attachments.length);
      setAttachments((current) => [...current, ...prepared]);
      setAttachmentError(null);
    } catch (error) {
      setAttachmentError(error instanceof Error ? error.message : 'Failed to attach files.');
    }
  };

  const handleDragEnter = (event: DragEvent<HTMLElement>) => {
    if (!canAttachFiles || !hasAssistantDroppedFiles(event.dataTransfer)) {
      return;
    }
    event.preventDefault();
    setDropDepth((current) => current + 1);
    setDropActive(true);
    setAttachmentError(null);
  };

  const handleDragOver = (event: DragEvent<HTMLElement>) => {
    if (!hasAssistantDroppedFiles(event.dataTransfer)) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = canAttachFiles ? 'copy' : 'none';
  };

  const handleDragLeave = (event: DragEvent<HTMLElement>) => {
    if (!hasAssistantDroppedFiles(event.dataTransfer)) {
      return;
    }
    event.preventDefault();
    setDropDepth((current) => {
      const next = Math.max(0, current - 1);
      if (next === 0) {
        setDropActive(false);
      }
      return next;
    });
  };

  const handleDrop = (event: DragEvent<HTMLElement>) => {
    if (!hasAssistantDroppedFiles(event.dataTransfer)) {
      return;
    }
    event.preventDefault();
    setDropActive(false);
    setDropDepth(0);
    if (!canAttachFiles) {
      return;
    }
    void attachFiles(listAssistantDroppedFiles(event.dataTransfer));
  };

  const submitPrompt = async () => {
    if (props.busy) {
      await props.onStop();
      return;
    }
    if (await props.onSubmitPrompt(prompt, attachments)) {
      setPrompt('');
      setAttachments([]);
      setAttachmentError(null);
    }
  };

  const showNewChat = !!props.thread && !props.busy;
  const sendDisabled = !assistantReady || props.busy || !prompt.trim();
  const composerPlaceholder = assistantReady
    ? promptTarget ? `Ask about ${promptTarget}` : 'Message the assistant'
    : 'Sign in from Preferences';

  return (
    <aside
      className="relative flex h-full min-h-0 flex-col overflow-hidden rounded-[1rem] bg-black/10 ring-1 ring-white/[0.05]"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {dropActive ? (
        <div className="pointer-events-none absolute inset-3 z-20 flex items-center justify-center rounded-[1rem] border-2 border-dashed border-primary/60 bg-background/90 text-[13px] text-muted-foreground">
          Drop files
        </div>
      ) : null}
      <AssistantPanelHeader
        assistantReady={assistantReady}
        metaSegments={metaSegments}
        onNewChat={async () => {
          if (!await props.onNewChat()) {
            return;
          }
          setPrompt('');
          setAttachments([]);
          setAttachmentError(null);
        }}
        panelTitle={panelTitle}
        showNewChat={showNewChat}
        statusState={statusState}
      />
      <AssistantPanelConversation
        assistantReady={assistantReady}
        busy={props.busy}
        contextKey={props.contextKey}
        conversation={conversation}
        loading={props.loading}
        onOpenChannel={props.onOpenChannel}
        promptTarget={promptTarget}
      />
      <AssistantPanelComposer
        attachmentError={attachmentError}
        attachments={attachments}
        assistantReady={assistantReady}
        busy={props.busy}
        canAttachFiles={canAttachFiles}
        composerPlaceholder={composerPlaceholder}
        onAttachFiles={attachFiles}
        onClearAttachmentError={() => setAttachmentError(null)}
        onPromptChange={setPrompt}
        onRemoveAttachment={(attachmentId) => {
          setAttachments((current) => current.filter((entry) => entry.id !== attachmentId));
          setAttachmentError(null);
        }}
        onSubmit={submitPrompt}
        prompt={prompt}
        sendDisabled={sendDisabled}
      />
    </aside>
  );
}
