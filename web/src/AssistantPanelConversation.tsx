import { useRef } from 'react';
import { Badge } from '@/components/ui/badge.js';
import { ScrollArea } from '@/components/ui/scroll-area.js';
import { AssistantMessageContent } from './AssistantMessageContent.js';
import type { ConversationEntry } from './assistant-panel-conversation.js';
import { useStickyScroll } from './useStickyScroll.js';

type AssistantPanelConversationProps = {
  assistantReady: boolean;
  busy: boolean;
  contextKey: string;
  conversation: ConversationEntry[];
  loading: boolean;
  onOpenChannel: (channel: string) => void;
  promptTarget: string | null;
};

export function AssistantPanelConversation(props: AssistantPanelConversationProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useStickyScroll({
    scrollRef,
    selectedBufferId: props.contextKey,
  });

  return (
    <ScrollArea viewportRef={scrollRef} className="min-h-0 flex-1 bg-transparent">
      <div className="space-y-3 px-3 py-3" data-scroll-anchor-item>
        {props.loading ? (
          <p className="px-1 py-1 text-[12px] text-muted-foreground">Loading…</p>
        ) : null}
        {!props.loading && props.conversation.length === 0 && props.assistantReady ? (
          <p className="px-1 py-1 text-[12px] text-muted-foreground">
            {props.promptTarget ? `No messages yet for ${props.promptTarget}.` : 'No assistant messages yet.'}
          </p>
        ) : null}
        {props.conversation.map((entry) => (
          <div key={entry.id} className={entry.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
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
                    <Badge key={attachment.id} variant="secondary" className="normal-case tracking-normal">
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
      <div aria-hidden className="h-px w-full" data-scroll-anchor-end />
    </ScrollArea>
  );
}
