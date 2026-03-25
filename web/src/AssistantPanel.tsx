import { Paperclip, X } from 'lucide-react';
import { type DragEvent, useEffect, useMemo, useRef, useState } from 'react';
import type {
  AssistantAttachmentMetadata,
  AssistantAskEvidenceGroup,
  AssistantItem,
  AssistantSnapshot,
  AssistantThread,
  AssistantTurn,
  AssistantTurnAttachmentInput,
} from '../../shared/protocol.js';
import { Badge } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import { Card, CardContent } from '@/components/ui/card.js';
import { ScrollArea } from '@/components/ui/scroll-area.js';
import { AssistantMessageContent } from './AssistantMessageContent.js';
import {
  assistantAttachmentLimit,
  assistantFileInputAccept,
  hasAssistantDroppedFiles,
  listAssistantDroppedFiles,
  prepareAssistantAttachments,
} from './assistant-attachments.js';
import { useStickyScroll } from './useStickyScroll.js';

export type AssistantPanelProps = {
  activeBufferLabel: string | null;
  assistant: AssistantSnapshot;
  contextSubtitle: string;
  contextKey: string;
  contextTitle: string;
  loading: boolean;
  busy: boolean;
  resolvedSubjectLabel: string | null;
  subjectPending: boolean;
  thread: AssistantThread | null;
  onNewChat: () => Promise<boolean>;
  onOpenChannel: (channel: string) => void;
  onStop: () => Promise<boolean>;
  onSubmitPrompt: (prompt: string, attachments: AssistantTurnAttachmentInput[]) => Promise<boolean>;
};

export function AssistantPanel(props: AssistantPanelProps) {
  const [prompt, setPrompt] = useState('');
  const [attachments, setAttachments] = useState<AssistantTurnAttachmentInput[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [dropActive, setDropActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const dropDepthRef = useRef(0);
  const conversation = useMemo(() => buildConversation(props.thread), [props.thread]);
  const assistantReady = props.assistant.serviceStatus === 'ready' && !!props.assistant.auth.account;
  const canAttachFiles = assistantReady && !props.busy;

  useStickyScroll({
    scrollRef,
    selectedBufferId: props.contextKey,
  });

  useEffect(() => {
    setPrompt('');
    setAttachments([]);
    setAttachmentError(null);
    setDropActive(false);
    dropDepthRef.current = 0;
  }, [props.contextKey]);

  useEffect(() => {
    if (canAttachFiles) {
      return;
    }
    setDropActive(false);
    dropDepthRef.current = 0;
  }, [canAttachFiles]);

  const sendDisabled = !assistantReady || props.busy || !prompt.trim();
  const composerPlaceholder = assistantReady
    ? 'Message the assistant'
    : 'Open Preferences to sign in first.';
  const attachmentHelpText = `Attach up to ${assistantAttachmentLimit} files per question.`;
  const composerHelpText = assistantReady
    ? `${attachmentHelpText} Press Enter to send and Shift+Enter for a new line. Text and image attachments stay in the assistant thread only.`
    : 'Open Preferences to sign in and enable the assistant.';
  const showStatus = !assistantReady
    || !!props.assistant.auth.lastError
    || (props.assistant.serviceStatus === 'error' && !!props.assistant.serviceError);
  const showNewChat = !!props.thread && !props.busy;

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
    dropDepthRef.current += 1;
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
    dropDepthRef.current = Math.max(0, dropDepthRef.current - 1);
    if (dropDepthRef.current === 0) {
      setDropActive(false);
    }
  };

  const handleDrop = (event: DragEvent<HTMLElement>) => {
    if (!hasAssistantDroppedFiles(event.dataTransfer)) {
      return;
    }
    event.preventDefault();
    dropDepthRef.current = 0;
    setDropActive(false);
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

  return (
    <aside
      className="relative flex h-full min-h-0 flex-col overflow-hidden border border-border bg-card"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {dropActive ? (
        <div className="pointer-events-none absolute inset-3 z-20 flex items-center justify-center rounded-md border-2 border-dashed border-primary/60 bg-background/90 text-[13px] text-muted-foreground">
          Drop files to attach
        </div>
      ) : null}
      {showStatus ? (
        <div className="space-y-2 border-b border-border bg-secondary/20 px-3 py-3 text-[13px]">
          {props.assistant.auth.lastError ? (
            <p className="text-destructive">{props.assistant.auth.lastError}</p>
          ) : null}
          {props.assistant.serviceStatus === 'error' && props.assistant.serviceError ? (
            <p className="text-destructive">{props.assistant.serviceError}</p>
          ) : null}
          {!assistantReady ? (
            <p className="text-muted-foreground">Open Preferences to sign in and enable the assistant.</p>
          ) : null}
        </div>
      ) : null}
      <div className="space-y-3 border-b border-border bg-card px-3 py-2.5">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Assistant</p>
            <p className="truncate text-sm font-medium text-foreground">{props.contextTitle}</p>
          </div>
          {showNewChat ? (
            <Button
              variant="outline"
              size="sm"
              disabled={!assistantReady}
              onClick={async () => {
                if (!await props.onNewChat()) {
                  return;
                }
                setPrompt('');
                setAttachments([]);
                setAttachmentError(null);
              }}
            >
              New chat
            </Button>
          ) : null}
        </div>
        <p className="text-[12px] leading-5 text-muted-foreground">{props.contextSubtitle}</p>
        {props.resolvedSubjectLabel || props.subjectPending ? (
          <div className="flex flex-wrap items-center gap-2">
            {props.activeBufferLabel ? (
              <Badge variant="secondary">Current buffer: {props.activeBufferLabel}</Badge>
            ) : null}
            <Badge variant={props.subjectPending ? 'outline' : 'default'}>
              {props.subjectPending
                ? 'Assistant subject: awaiting confirmation'
                : `Assistant subject: ${props.resolvedSubjectLabel}`}
            </Badge>
          </div>
        ) : null}
      </div>

      <ScrollArea viewportRef={scrollRef} className="min-h-0 flex-1 bg-background">
        <div className="space-y-3 px-3 py-3">
          {props.loading ? (
            <div className="rounded-md border border-border bg-card px-3 py-2 text-[13px] text-muted-foreground">
              Loading conversation…
            </div>
          ) : null}
          {!props.loading && conversation.length === 0 ? (
            <Card className="border-dashed bg-card/80">
              <CardContent className="space-y-3 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="default">Assistant chat</Badge>
                  <Badge variant="secondary">Up to {assistantAttachmentLimit} files</Badge>
                  {props.activeBufferLabel ? (
                    <Badge variant="secondary">Current buffer: {props.activeBufferLabel}</Badge>
                  ) : null}
                  {props.resolvedSubjectLabel ? (
                    <Badge variant="default">Assistant subject: {props.resolvedSubjectLabel}</Badge>
                  ) : null}
                  {!props.resolvedSubjectLabel && props.subjectPending ? (
                    <Badge variant="outline">Assistant subject: awaiting confirmation</Badge>
                  ) : null}
                </div>
                <div className="space-y-1">
                  <h3 className="text-sm font-semibold text-foreground">No assistant history yet</h3>
                  <p className="text-[13px] text-muted-foreground">
                    {props.contextSubtitle}
                  </p>
                </div>
                <p className="text-[12px] text-muted-foreground">
                  Chat directly with the assistant. It only reads transcript excerpts when it decides they are needed for the current turn.
                </p>
              </CardContent>
            </Card>
          ) : null}
          {conversation.map((entry) => (
            <div
              key={entry.id}
              className={entry.role === 'user' ? 'flex justify-end' : 'flex justify-start'}
            >
              <div
                className={
                  entry.role === 'user'
                    ? 'max-w-[92%] rounded-md bg-accent px-3 py-2 text-[13px] text-foreground'
                    : entry.role === 'assistant'
                      ? 'max-w-[92%] rounded-md border border-border bg-card px-3 py-2 text-[13px] text-foreground'
                      : 'max-w-[92%] rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-[13px] text-destructive'
                }
              >
                <AssistantMessageContent
                  text={entry.text}
                  evidenceGroups={entry.evidenceGroups}
                  normalizeText={entry.role === 'assistant'}
                  onOpenChannel={props.onOpenChannel}
                />
                {entry.attachments.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {entry.attachments.map((attachment) => (
                      <Badge
                        key={attachment.id}
                        variant="secondary"
                        className="normal-case tracking-normal"
                      >
                        {attachment.name}
                      </Badge>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          ))}
          {props.busy ? (
            <div className="flex justify-start">
              <div className="rounded-md border border-border bg-card px-3 py-2 text-[13px] text-muted-foreground">
                Thinking…
              </div>
            </div>
          ) : null}
        </div>
      </ScrollArea>

      <div className="space-y-2 border-t border-border bg-card px-3 py-3">
        <input
          ref={fileInputRef}
          type="file"
          hidden
          multiple
          accept={assistantFileInputAccept}
          onChange={async (event) => {
            const files = event.currentTarget.files;
            event.currentTarget.value = '';
            if (!files || files.length === 0) {
              return;
            }
            await attachFiles(Array.from(files));
          }}
        />
        {attachments.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {attachments.map((attachment) => (
              <div
                key={attachment.id}
                className="flex max-w-full items-center gap-2 rounded-full border border-border bg-background px-3 py-1 text-[12px] text-muted-foreground"
              >
                <span className="truncate">{attachment.name}</span>
                <button
                  type="button"
                  aria-label={`Remove ${attachment.name}`}
                  className="text-muted-foreground transition hover:text-foreground"
                  onClick={() => {
                    setAttachments((current) => current.filter((entry) => entry.id !== attachment.id));
                    setAttachmentError(null);
                  }}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        ) : null}
        {attachmentError ? (
          <p className="text-[12px] text-destructive">{attachmentError}</p>
        ) : null}
        <textarea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={(event) => {
            if (!shouldSubmitAssistantPrompt(event)) {
              return;
            }
            event.preventDefault();
            void submitPrompt();
          }}
          placeholder={composerPlaceholder}
          disabled={!assistantReady || props.busy}
          className="min-h-24 w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-[13px] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-60"
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          {props.busy ? (
            <div />
          ) : (
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                disabled={!canAttachFiles}
                onClick={() => {
                  setAttachmentError(null);
                  fileInputRef.current?.click();
                }}
              >
                <Paperclip className="mr-1.5 h-4 w-4" />
                Add files
              </Button>
            </div>
          )}
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Button
              variant={props.busy ? 'destructive' : 'default'}
              disabled={props.busy ? false : sendDisabled}
              onClick={() => void submitPrompt()}
            >
              {props.busy ? 'Stop' : 'Send'}
            </Button>
          </div>
        </div>
        <p className="text-[12px] leading-5 text-muted-foreground">{composerHelpText}</p>
      </div>
    </aside>
  );
}

type AssistantPromptKeyEvent = {
  key: string;
  shiftKey: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  nativeEvent: {
    isComposing?: boolean;
  };
};

export const shouldSubmitAssistantPrompt = (
  event: AssistantPromptKeyEvent,
) =>
  event.key === 'Enter'
  && !event.shiftKey
  && !event.altKey
  && !event.ctrlKey
  && !event.metaKey
  && !event.nativeEvent.isComposing;

type ConversationEntry = {
  attachments: AssistantAttachmentMetadata[];
  evidenceGroups: AssistantAskEvidenceGroup[];
  id: string;
  role: 'user' | 'assistant' | 'error';
  text: string;
};

const buildConversation = (thread: AssistantThread | null): ConversationEntry[] => {
  if (!thread) {
    return [];
  }
  return thread.turns.flatMap((turn) => {
    const evidenceGroups = thread.task === 'ask' ? collectTurnEvidenceGroups(turn) : [];
    const lastAssistantItemId = findLastAssistantItemId(turn.items);
    const items = turn.items.flatMap((item) => mapItemToConversationEntry(item, {
      evidenceGroups: item.id === lastAssistantItemId ? evidenceGroups : [],
    }));
    if (turn.status === 'failed' && turn.error) {
      return [...items, {
        id: `${turn.id}-error`,
        role: 'error' as const,
        text: turn.error,
        attachments: [],
        evidenceGroups: [],
      }];
    }
    return items;
  });
};

const mapItemToConversationEntry = (
  item: AssistantItem,
  options: { evidenceGroups: AssistantAskEvidenceGroup[] },
): ConversationEntry[] => {
  if (item.type === 'userMessage') {
    return [{
      id: item.id,
      role: 'user',
      text: item.text,
      attachments: item.attachments,
      evidenceGroups: [],
    }];
  }
  if (item.type === 'agentMessage' && item.text.trim()) {
    return [{
      id: item.id,
      role: 'assistant',
      text: item.text,
      attachments: [],
      evidenceGroups: options.evidenceGroups,
    }];
  }
  return [];
};

const findLastAssistantItemId = (items: AssistantItem[]) => {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    if (item?.type === 'agentMessage' && item.text.trim()) {
      return item.id;
    }
  }
  return null;
};

const collectTurnEvidenceGroups = (turn: AssistantTurn) => {
  const retrievals = turn.routing?.retrievals?.length
    ? turn.routing.retrievals
    : turn.routing?.retrieval
      ? [turn.routing.retrieval]
      : [];
  const merged: AssistantAskEvidenceGroup[] = [];
  const groupsByHeading = new Map<string, AssistantAskEvidenceGroup>();

  for (const retrieval of retrievals) {
    for (const group of retrieval.evidenceGroups ?? []) {
      const heading = group.heading.trim();
      const lines = group.lines.filter((line) => line.body.trim());
      if (!heading || lines.length === 0) {
        continue;
      }
      const existing = groupsByHeading.get(heading);
      if (existing) {
        for (const line of lines) {
          if (!existing.lines.some((candidate) => candidate.messageId === line.messageId)) {
            existing.lines.push(line);
          }
        }
        continue;
      }
      const nextGroup = { heading, lines: [...lines] };
      groupsByHeading.set(heading, nextGroup);
      merged.push(nextGroup);
    }
  }

  return merged;
};
