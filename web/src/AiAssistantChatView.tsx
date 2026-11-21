import type { ReactNode } from 'react';
import { ArrowUp, FileText, Reply, Square } from 'lucide-react';
import { Button } from '@/components/ui/button.js';
import { AiAssistantConversation } from './AiAssistantConversation.js';
import { generalContextExpiredMessage, type AssistantAskHandler, type AssistantChatConfirmation, type AssistantEntry } from './AiAssistantChatTypes.js';

type AiAssistantChatViewProps = {
  showMedia: boolean;
  entries: readonly AssistantEntry[];
  error: string;
  input: string;
  onAsk: AssistantAskHandler;
  onCancel?: () => void;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onUseSuggestion: (value: string) => void;
  onOpenSource?: (bufferId: string, messageId: string) => Promise<boolean>;
  pending: boolean;
  pendingLabel: string;
  usingChat?: boolean;
  confirmation?: AssistantChatConfirmation;
  modelControl?: ReactNode;
};

export function AiAssistantChatView(props: AiAssistantChatViewProps) {
  const { confirmation } = props;
  const empty = props.entries.length === 0 && !props.pending && !confirmation;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {empty ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="flex min-h-full flex-col justify-end px-1.5 pb-7 pt-3">
            <h3 className="mb-2.5 text-xl font-semibold tracking-tight text-foreground">How can I help?</h3>
            <Button variant="ghost" size="sm" className="h-8 justify-start gap-2.5 px-0 text-[14px] font-normal"
              onClick={() => props.onAsk('answer', 'Catch me up on the current chat. What has been happening and what should I know?', 'Catch me up', undefined, 'auto')}>
              <FileText aria-hidden className="text-muted-foreground" /> Catch me up
            </Button>
            <Button variant="ghost" size="sm" className="h-8 justify-start gap-2.5 px-0 text-[14px] font-normal"
              onClick={() => props.onAsk('suggest-reply', '', 'Help me reply', 'Drafting', 'auto')}>
              <Reply aria-hidden className="text-muted-foreground" /> Help me reply
            </Button>
          </div>
        </div>
      ) : (
        <AiAssistantConversation entries={props.entries} pending={props.pending} showMedia={props.showMedia}
          pendingLabel={props.pendingLabel} onUseSuggestion={props.onUseSuggestion} onOpenSource={props.onOpenSource} />
      )}
      {props.error ? (
        <p role="alert" className="text-xs leading-5 text-amber-100">{props.error}</p>
      ) : null}
      {confirmation ? (
        <div className="min-w-0 shrink-0 space-y-2 rounded-md border border-border p-2 text-sm">
          {confirmation.generalContextExpired ? <p role="status" className="text-xs text-muted-foreground">{generalContextExpiredMessage}</p> : null}
          <div role="region" aria-label="Question awaiting chat access" tabIndex={0}
            className="max-h-24 overflow-y-auto overscroll-contain rounded-sm text-xs whitespace-pre-wrap text-muted-foreground wrap-anywhere focus-visible:outline-2 focus-visible:outline-ring">
            {confirmation.prompt}
          </div>
          <p role="status">{confirmation.message}</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={() => props.onAsk('answer', confirmation.prompt, undefined, undefined, 'auto')}>Use this chat</Button>
            <Button type="button" size="sm" variant="outline" onClick={() => props.onAsk('answer', confirmation.prompt, undefined, undefined, 'none')}>Answer without chat</Button>
          </div>
        </div>
      ) : null}
      {props.pending && props.usingChat ? <p role="status" className="text-xs text-muted-foreground">Using this chat</p> : null}
      <form className="flex shrink-0 flex-col rounded-[11px] border border-white/10 bg-[#283444] p-1.5 focus-within:border-primary/45"
        onSubmit={event => {
          event.preventDefault();
          if (!props.pending) props.onSubmit();
        }}>
        <textarea aria-label="Message assistant" rows={1} value={props.input}
          onChange={event => props.onChange(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              if (!props.pending) props.onSubmit();
            }
          }}
          placeholder="Ask anything…"
          aria-busy={props.pending}
          className="max-h-32 min-h-8 w-full resize-none overflow-y-auto bg-transparent px-1.5 py-1.5 text-[14px] leading-5 text-foreground outline-none [field-sizing:content] placeholder:text-muted-foreground" />
        <div className="flex items-center gap-1.5">
          <div className="min-w-0 flex-1">{props.modelControl}</div>
          {props.pending ? (
            <Button type="button" size="icon" className="size-8 shrink-0 rounded-full"
              aria-label="Stop response" title="Stop response" onClick={props.onCancel}>
              <Square className="size-3 fill-current" />
            </Button>
          ) : (
            <Button type="submit" size="icon" className="size-8 shrink-0 rounded-full"
              aria-label="Ask assistant" title="Send message" disabled={!props.input.trim()}>
              <ArrowUp className="size-[18px]" />
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
