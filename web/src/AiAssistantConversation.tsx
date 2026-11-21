import { lazy, Suspense, useLayoutEffect, useRef } from 'react';
import { LoaderCircle } from 'lucide-react';
import { Button } from '@/components/ui/button.js';
import { ScrollArea } from '@/components/ui/scroll-area.js';
import { readAssistantSourceLabels, stripAssistantSourceLabels } from '../../shared/ai-assistant-sources.js';
import { AiAssistantMedia } from './AiAssistantMedia.js';
import { AiAssistantSources } from './AiAssistantSources.js';
import { generalContextExpiredMessage, type AssistantEntry } from './AiAssistantChatTypes.js';

const AiAssistantMarkdown = lazy(async () => {
  const module = await import('./AiAssistantMarkdown.js');
  return { default: module.AiAssistantMarkdown };
});

type AiAssistantConversationProps = {
  showMedia: boolean;
  entries: readonly AssistantEntry[];
  onUseSuggestion: (value: string) => void;
  onOpenSource?: (bufferId: string, messageId: string) => Promise<boolean>;
  pending: boolean;
  pendingLabel: string;
};

export function AiAssistantConversation(props: AiAssistantConversationProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const followLatest = useRef(true);
  const lastEntry = props.entries.at(-1);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (viewport && (followLatest.current || lastEntry?.role === 'user')) viewport.scrollTop = viewport.scrollHeight;
  }, [lastEntry, props.pending]);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const log = logRef.current;
    if (!viewport || !log) return;
    const observer = new ResizeObserver(() => {
      if (followLatest.current) viewport.scrollTop = viewport.scrollHeight;
    });
    observer.observe(log);
    return () => observer.disconnect();
  }, []);

  return (
    <ScrollArea className="min-h-0 flex-1" viewportRef={viewportRef} onScrollCapture={event => {
      const viewport = viewportRef.current;
      if (viewport && event.target === viewport) {
        followLatest.current = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 60;
      }
    }}>
      <div ref={logRef} role="log" aria-label="Assistant conversation" className="flex min-w-0 flex-col gap-4 px-1.5 pt-2 pb-4">
        {props.entries.map(entry => entry.role === 'user' ? (
          <p key={entry.id} className="max-w-[92%] self-end whitespace-pre-wrap rounded-[13px] bg-[#2b384b] px-3 py-2 text-[14px] leading-[21px] wrap-anywhere text-foreground">
            {entry.text}
          </p>
        ) : (
          <AssistantReply key={entry.id} entry={entry} showMedia={props.showMedia} onUseSuggestion={props.onUseSuggestion} onOpenSource={props.onOpenSource} />
        ))}
        {props.pending ? (
          <div role="status" className="flex items-center gap-2 text-[13px] leading-6 text-muted-foreground">
            <LoaderCircle aria-hidden className="size-3.5 motion-safe:animate-spin" />
            {props.pendingLabel}…
          </div>
        ) : null}
      </div>
    </ScrollArea>
  );
}

function AssistantReply({ entry, showMedia, onUseSuggestion, onOpenSource }: {
  entry: AssistantEntry;
  showMedia: boolean;
  onUseSuggestion: (value: string) => void;
  onOpenSource?: (bufferId: string, messageId: string) => Promise<boolean>;
}) {
  const { context } = entry;
  const attachments = context?.attachments ?? [];
  const cited = readAssistantSourceLabels(entry.text);
  for (const attachment of attachments) cited.add(attachment.source);
  const chatSources = context?.sources?.filter(({ label }) => cited.has(label)) ?? [];
  const webSources = context?.webSources?.filter(({ label }) => cited.has(label)) ?? [];
  const text = stripAssistantSourceLabels(entry.text, new Set([...chatSources, ...webSources].map(({ label }) => label)));

  return (
    <div className="min-w-0 text-[14px] leading-[21px] text-foreground/95">
      {entry.generalContextExpired ? <p role="status" className="mb-2 text-xs text-muted-foreground">{generalContextExpiredMessage}</p> : null}
      <div className="min-w-0 space-y-2 wrap-anywhere">
        {entry.mode === 'suggest-reply' ? <p className="whitespace-pre-wrap">{text}</p> : (
          <Suspense fallback={<p className="whitespace-pre-wrap">{text}</p>}>
            <AiAssistantMarkdown>{text}</AiAssistantMarkdown>
          </Suspense>
        )}
      </div>
      {attachments.length > 0 ? <AiAssistantMedia attachments={attachments} showMedia={showMedia} /> : null}
      <AiAssistantSources chatSources={chatSources} webSources={webSources}
        onOpenSource={context && onOpenSource ? messageId => onOpenSource(context.buffer.id, messageId) : undefined} />
      {entry.mode === 'suggest-reply' ? (
        <Button type="button" size="sm" variant="outline" className="mt-2.5 h-7 px-2.5 text-xs" onClick={() => onUseSuggestion(text)}>
          Use draft
        </Button>
      ) : null}
    </div>
  );
}
