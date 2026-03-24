import { Paperclip, X } from 'lucide-react';
import { type DragEvent, useEffect, useMemo, useRef, useState } from 'react';
import type {
  AssistantAttachmentMetadata,
  AssistantItem,
  AssistantSnapshot,
  AssistantThread,
  AssistantTurnAttachmentInput,
} from '../../shared/protocol.js';
import { Button } from '@/components/ui/button.js';
import { ScrollArea } from '@/components/ui/scroll-area.js';
import {
  assistantFileInputAccept,
  hasAssistantDroppedFiles,
  listAssistantDroppedFiles,
  prepareAssistantAttachments,
} from './assistant-attachments.js';

export type AssistantPanelProps = {
  assistant: AssistantSnapshot;
  canClearHistory: boolean;
  canImportHistory: boolean;
  contextKey: string;
  contextEmpty: boolean;
  loading: boolean;
  busy: boolean;
  thread: AssistantThread | null;
  onClearHistory: () => Promise<boolean>;
  onImportHistory: (prompt: string, attachments: AssistantTurnAttachmentInput[]) => Promise<boolean>;
  onStop: () => Promise<boolean>;
  onSubmitPrompt: (prompt: string, attachments: AssistantTurnAttachmentInput[]) => Promise<boolean>;
};

export function AssistantPanel(props: AssistantPanelProps) {
  const [prompt, setPrompt] = useState('');
  const [attachments, setAttachments] = useState<AssistantTurnAttachmentInput[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [dropActive, setDropActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dropDepthRef = useRef(0);
  const conversation = useMemo(() => buildConversation(props.thread), [props.thread]);
  const assistantReady = props.assistant.serviceStatus === 'ready' && !!props.assistant.auth.account;
  const canAttachFiles = assistantReady && !props.busy;

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
  const importDisabled = !assistantReady || props.busy || attachments.length === 0 || !props.canImportHistory;
  const showStatus = props.contextEmpty
    || !assistantReady
    || !!props.assistant.auth.lastError
    || (props.assistant.serviceStatus === 'error' && !!props.assistant.serviceError);

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
          {props.contextEmpty ? (
            <p className="text-muted-foreground">No history is available for this buffer yet.</p>
          ) : null}
          {!assistantReady ? (
            <p className="text-muted-foreground">Open Preferences to sign in and enable the assistant.</p>
          ) : null}
        </div>
      ) : null}

      <ScrollArea className="min-h-0 flex-1 bg-background">
        <div className="space-y-3 px-3 py-3">
          {props.loading ? (
            <div className="rounded-md border border-border bg-card px-3 py-2 text-[13px] text-muted-foreground">
              Loading conversation…
            </div>
          ) : null}
          {!props.loading && conversation.length === 0 ? (
            <div className="rounded-md border border-border bg-card px-3 py-3 text-[13px] text-muted-foreground">
              Ask a question.
            </div>
          ) : null}
          {conversation.map((entry) => (
            <div
              key={entry.id}
              className={entry.role === 'user' ? 'flex justify-end' : 'flex justify-start'}
            >
              <div
                className={
                  entry.role === 'user'
                    ? 'max-w-[90%] rounded-md bg-accent px-3 py-2 text-[13px] text-foreground'
                    : entry.role === 'assistant'
                      ? 'max-w-[90%] rounded-md border border-border bg-card px-3 py-2 text-[13px] text-foreground'
                      : 'max-w-[90%] rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-[13px] text-destructive'
                }
              >
                <p className="whitespace-pre-wrap">{entry.text}</p>
                {entry.attachments.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {entry.attachments.map((attachment) => (
                      <span
                        key={attachment.id}
                        className="rounded-full border border-border/70 bg-background/70 px-2 py-0.5 text-[11px] text-muted-foreground"
                      >
                        {attachment.name}
                      </span>
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
          placeholder={assistantReady ? 'Ask a question' : 'Open Preferences to sign in first.'}
          disabled={!assistantReady || props.busy}
          className="min-h-24 w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-[13px] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-60"
        />
        <div className="flex items-center justify-between gap-2">
          {props.busy ? (
            <div />
          ) : (
            <div className="flex items-center gap-2">
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
              {props.canClearHistory ? (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={props.busy}
                  onClick={async () => {
                    if (await props.onClearHistory()) {
                      setPrompt('');
                      setAttachments([]);
                      setAttachmentError(null);
                    }
                  }}
                >
                  Clear
                </Button>
              ) : null}
            </div>
          )}
          <div className="flex items-center gap-2">
            {!props.busy ? (
              <Button
                variant="outline"
                disabled={importDisabled}
                onClick={async () => {
                  if (attachments.some((attachment) => attachment.kind !== 'text')) {
                    setAttachmentError('Only text log files can be imported into chat history.');
                    return;
                  }
                  if (await props.onImportHistory(prompt, attachments)) {
                    setPrompt('');
                    setAttachments([]);
                    setAttachmentError(null);
                  }
                }}
              >
                Import logs
              </Button>
            ) : null}
            <Button
              variant={props.busy ? 'destructive' : 'default'}
              disabled={props.busy ? false : sendDisabled}
              onClick={async () => {
                if (props.busy) {
                  await props.onStop();
                  return;
                }
                if (await props.onSubmitPrompt(prompt, attachments)) {
                  setPrompt('');
                  setAttachments([]);
                  setAttachmentError(null);
                }
              }}
            >
              {props.busy ? 'Stop' : 'Send'}
            </Button>
          </div>
        </div>
      </div>
    </aside>
  );
}

type ConversationEntry = {
  attachments: AssistantAttachmentMetadata[];
  id: string;
  role: 'user' | 'assistant' | 'error';
  text: string;
};

const buildConversation = (thread: AssistantThread | null): ConversationEntry[] => {
  if (!thread) {
    return [];
  }
  return thread.turns.flatMap((turn) => {
    const items = turn.items.flatMap((item) => mapItemToConversationEntry(item));
    if (turn.status === 'failed' && turn.error) {
      return [...items, {
        id: `${turn.id}-error`,
        role: 'error' as const,
        text: turn.error,
        attachments: [],
      }];
    }
    return items;
  });
};

const mapItemToConversationEntry = (item: AssistantItem): ConversationEntry[] => {
  if (item.type === 'userMessage') {
    return [{ id: item.id, role: 'user', text: item.text, attachments: item.attachments }];
  }
  if (item.type === 'agentMessage' && item.text.trim()) {
    return [{ id: item.id, role: 'assistant', text: item.text, attachments: [] }];
  }
  return [];
};
