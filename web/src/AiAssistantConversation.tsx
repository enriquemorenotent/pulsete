import { useEffect, useRef } from 'react';
import { Bot, LoaderCircle } from 'lucide-react';
import { Button } from '@/components/ui/button.js';
import { ScrollArea } from '@/components/ui/scroll-area.js';
import { cn } from '@/lib/utils.js';
import type { AssistantEntry } from './AiAssistantChatTypes.js';

type AiAssistantConversationProps = {
  entries: readonly AssistantEntry[];
  onUseSuggestion: (value: string) => void;
  pending: boolean;
  pendingLabel: string;
};

export function AiAssistantConversation(props: AiAssistantConversationProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const viewport = viewportRef.current;
      viewport?.scrollTo({ top: viewport.scrollHeight, behavior: 'smooth' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [props.entries.length, props.pending]);

  return (
    <ScrollArea className="min-h-0 flex-1 pr-1" viewportRef={viewportRef}>
      <div className="flex min-h-full flex-col justify-end gap-2 py-2">
        {props.entries.map((entry) => (
          <AssistantBubble
            key={entry.id}
            entry={entry}
            onUseSuggestion={props.onUseSuggestion}
          />
        ))}
        {props.pending ? <AssistantPendingBubble label={props.pendingLabel} /> : null}
      </div>
    </ScrollArea>
  );
}

function AssistantBubble(props: {
  entry: AssistantEntry;
  onUseSuggestion: (value: string) => void;
}) {
  const assistant = props.entry.role === 'assistant';
  return (
    <div className={cn('flex', assistant ? 'justify-start' : 'justify-end')}>
      <div className={cn(
        'max-w-[92%] rounded-md border px-3 py-2 text-[13px] leading-5 shadow-sm',
        assistant
          ? 'border-white/[0.055] bg-black/18 text-foreground/88'
          : 'border-primary/14 bg-primary/12 text-foreground',
      )}>
        {assistant ? <Bot className="mb-1 size-3.5 text-muted-foreground" /> : null}
        <div className="whitespace-pre-wrap">{props.entry.text}</div>
        {props.entry.mode === 'suggest-reply' ? (
          <Button
            size="sm"
            variant="ghost"
            className="mt-2 h-7 px-2"
            onClick={() => props.onUseSuggestion(props.entry.text)}
          >
            Use draft
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function AssistantPendingBubble(props: { label: string }) {
  return (
    <div className="flex justify-start" role="status" aria-live="polite">
      <div className="flex max-w-[92%] items-center gap-2 rounded-md border border-white/[0.055] bg-black/20 px-3 py-2 text-[13px] text-foreground/82 shadow-sm">
        <LoaderCircle className="size-3.5 animate-spin text-primary" />
        <span>{props.label}</span>
        <span className="flex items-center gap-1" aria-hidden="true">
          <span className="size-1 rounded-full bg-primary/70 animate-pulse" />
          <span className="size-1 rounded-full bg-primary/70 animate-pulse [animation-delay:120ms]" />
          <span className="size-1 rounded-full bg-primary/70 animate-pulse [animation-delay:240ms]" />
        </span>
      </div>
    </div>
  );
}
