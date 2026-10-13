import { useRef } from 'react';
import { FileText, LoaderCircle, PenLine, Search, Send, Sparkles } from 'lucide-react';
import type { AiAssistantScope } from '../../shared/protocol-ai.js';
import { Button } from '@/components/ui/button.js';
import { AiAssistantConversation } from './AiAssistantConversation.js';
import type { AssistantAskHandler, AssistantEntry } from './AiAssistantChatTypes.js';

type AiAssistantChatViewProps = {
  entries: readonly AssistantEntry[];
  error: string;
  input: string;
  onAsk: AssistantAskHandler;
  onCancel?: () => void;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onUseSuggestion: (value: string) => void;
  pending: boolean;
  pendingLabel: string;
  scope?: AiAssistantScope;
  onScopeChange?: (scope: AiAssistantScope) => void;
};

export function AiAssistantChatView(props: AiAssistantChatViewProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const empty = props.entries.length === 0 && !props.pending;
  const scope = props.scope ?? 'recent';
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {empty ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="flex min-h-full flex-col justify-end pb-3 pt-4">
          <Sparkles className="mb-3 size-5 text-primary/80" aria-hidden />
          <h3 className="text-base font-semibold leading-6">A little help with the conversation</h3>
          <p className="mt-1.5 text-[13px] leading-5 text-muted-foreground">
            Find a detail, make sense of what happened, or work out what to say next.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button variant="outline" size="sm" className="justify-start" disabled={props.pending}
              onClick={() => props.onAsk('answer', 'Summarize the selected conversation context, highlighting key points and open questions.', 'Summarize', 'Summarizing')}>
              <FileText /> Summarize
            </Button>
            <Button variant="outline" size="sm" className="justify-start" disabled={props.pending}
              onClick={() => props.onAsk('suggest-reply', '', 'Draft reply', 'Drafting')}>
              <PenLine /> Draft reply
            </Button>
          </div>
          </div>
        </div>
      ) : (
        <AiAssistantConversation entries={props.entries} pending={props.pending}
          pendingLabel={props.pendingLabel} onUseSuggestion={props.onUseSuggestion} />
      )}
      {props.error ? (
        <p role="alert" className="rounded-sm border border-amber-300/18 bg-amber-300/8 px-2.5 py-2 text-[12px] text-amber-100">{props.error}</p>
      ) : null}
      {props.pending ? <Button type="button" variant="outline" size="sm" onClick={props.onCancel}>Stop</Button> : null}
      <div className="shrink-0 space-y-2 border-t border-white/[0.07] pt-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            Use
            <select aria-label="Assistant context scope" value={scope} disabled={props.pending}
              className="min-w-0 rounded border border-white/10 bg-[#202733] px-2 py-1 text-xs text-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring"
              onChange={(event) => props.onScopeChange?.(event.target.value as AiAssistantScope)}>
              <option value="recent">Recent messages</option>
              <option value="saved">Saved history</option>
            </select>
          </label>
          <button type="button" className="inline-flex items-center gap-1.5 rounded py-1 text-xs text-muted-foreground hover:text-foreground focus-visible:outline focus-visible:outline-ring disabled:opacity-50"
            disabled={props.pending} onClick={() => {
              props.onScopeChange?.('saved');
              if (!props.input.trim()) props.onChange('Find messages about ');
              inputRef.current?.focus();
            }}>
            <Search className="size-3.5" aria-hidden /> Find
          </button>
        </div>
        <p className="text-[11px] leading-4 text-muted-foreground">
          {scope === 'recent' ? 'Uses up to 120 recent messages; long messages may be shortened.' : 'Searches saved history. Long histories may be incomplete.'}
        </p>
        <div className="relative rounded-md border border-white/[0.12] bg-black/10 transition-colors focus-within:border-ring/60">
          <textarea ref={inputRef} aria-label="Message assistant" rows={3} value={props.input}
            onChange={(event) => props.onChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                props.onSubmit();
              }
            }}
            placeholder={props.pending ? 'Assistant is working…' : 'Ask about this conversation…'}
            disabled={props.pending} aria-busy={props.pending}
            className="min-h-20 w-full resize-none bg-transparent px-3 py-2.5 pr-11 text-[13px] leading-5 text-foreground outline-none placeholder:text-muted-foreground disabled:opacity-70" />
          <Button size="icon" className="absolute bottom-2 right-2 size-7 rounded-md"
            aria-label={props.pending ? 'Assistant working' : 'Ask assistant'}
            disabled={props.pending || !props.input.trim()} onClick={props.onSubmit}>
            {props.pending ? <LoaderCircle className="animate-spin" /> : <Send />}
          </Button>
        </div>
      </div>
    </div>
  );
}
