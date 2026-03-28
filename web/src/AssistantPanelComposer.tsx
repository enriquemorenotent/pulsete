import { Paperclip, X } from 'lucide-react';
import { useRef } from 'react';
import type { AssistantTurnAttachmentInput } from '../../shared/protocol.js';
import { Button } from '@/components/ui/button.js';
import { assistantFileInputAccept } from './assistant-attachments.js';
import { shouldSubmitAssistantPrompt } from './assistant-panel-status.js';

type AssistantPanelComposerProps = {
  attachmentError: string | null;
  attachments: AssistantTurnAttachmentInput[];
  assistantReady: boolean;
  busy: boolean;
  canAttachFiles: boolean;
  composerPlaceholder: string;
  onAttachFiles: (files: File[]) => Promise<void>;
  onClearAttachmentError: () => void;
  onPromptChange: (value: string) => void;
  onRemoveAttachment: (attachmentId: string) => void;
  onSubmit: () => Promise<void>;
  prompt: string;
  sendDisabled: boolean;
};

export function AssistantPanelComposer(props: AssistantPanelComposerProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  return (
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
          await props.onAttachFiles(Array.from(files));
        }}
      />
      {props.attachments.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {props.attachments.map((attachment) => (
            <div
              key={attachment.id}
              className="flex max-w-full items-center gap-2 rounded-full border border-border bg-background px-3 py-1 text-[12px] text-muted-foreground"
            >
              <span className="truncate">{attachment.name}</span>
              <button
                type="button"
                aria-label={`Remove ${attachment.name}`}
                className="text-muted-foreground transition hover:text-foreground"
                onClick={() => props.onRemoveAttachment(attachment.id)}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      ) : null}
      {props.attachmentError ? (
        <p className="text-[12px] text-destructive">{props.attachmentError}</p>
      ) : null}
      <textarea
        value={props.prompt}
        onChange={(event) => props.onPromptChange(event.target.value)}
        onKeyDown={(event) => {
          if (!shouldSubmitAssistantPrompt(event)) {
            return;
          }
          event.preventDefault();
          void props.onSubmit();
        }}
        placeholder={props.composerPlaceholder}
        disabled={!props.assistantReady || props.busy}
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
              disabled={!props.canAttachFiles}
              onClick={() => {
                props.onClearAttachmentError();
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
            disabled={props.busy ? false : props.sendDisabled}
            onClick={() => void props.onSubmit()}
          >
            {props.busy ? 'Stop' : 'Send'}
          </Button>
        </div>
      </div>
    </div>
  );
}
