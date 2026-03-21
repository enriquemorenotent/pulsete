import { memo, useMemo, type RefObject } from 'react';
import { Plug2 } from 'lucide-react';
import type { ChatMessage } from '../../shared/protocol.js';
import { cn } from '@/lib/utils.js';
import { FormattedMessageText } from './FormattedMessageText.js';
import { MessageAvatar } from './MessageAvatar.js';
import { ChatPaneCompactMessageRow } from './ChatPaneCompactMessageRow.js';
import { ChatPaneMessageGroup } from './ChatPaneMessageGroup.js';
import type { MessageDisplayMode } from './message-display-mode.js';
import {
  buildRenderBlocks,
  formatMessageTime,
  getGroupSourceLabel,
  isActionBody,
  isCompactMessage,
  messageTone,
  showKindLabel,
} from './chat-pane-message-utils.js';

type ChatPaneMessageListProps = {
  messages: ChatMessage[];
  scrollRef: RefObject<HTMLDivElement | null>;
  emptyBody: string;
  mode: MessageDisplayMode;
  listKind: 'chat' | 'server';
  onOpenChannel: (channel: string) => void;
};

export const ChatPaneMessageList = memo(function ChatPaneMessageList(props: ChatPaneMessageListProps) {
  const renderBlocks = useMemo(
    () => buildRenderBlocks(props.messages, props.listKind),
    [props.listKind, props.messages]
  );

  return (
    <div ref={props.scrollRef} className="min-h-0 flex-1 overflow-y-auto bg-background/45 px-3 py-2">
      {props.messages.length === 0 ? (
        <div className="flex h-full items-center justify-center">
          <div className="w-full max-w-md border border-border bg-card px-4 py-5 text-center">
            <div className="mx-auto mb-3 flex size-8 items-center justify-center border border-border bg-secondary">
              <Plug2 className="size-4 text-muted-foreground" />
            </div>
            <p className="text-[13px] leading-6 text-muted-foreground">{props.emptyBody}</p>
          </div>
        </div>
      ) : (
        <div className="space-y-0.5 font-mono text-[12px]">
          {renderBlocks.map((block) =>
            block.kind === 'group' ? (
              <ChatPaneMessageGroup
                key={block.messages[0].id}
                messages={block.messages}
                mode={props.mode}
                sourceLabel={getGroupSourceLabel(block.messages[0], props.listKind)}
                onOpenChannel={props.onOpenChannel}
              />
            ) : isCompactMessage(block.message) ? (
              <ChatPaneCompactMessageRow
                key={block.message.id}
                message={block.message}
                mode={props.mode}
                onOpenChannel={props.onOpenChannel}
              />
            ) : (
              <article key={block.message.id} className={cn('border px-2 py-1.5', messageTone(block.message))}>
                <div
                  className={cn(
                    'grid gap-x-3',
                    block.message.nick ? 'grid-cols-[2.75rem_minmax(0,1fr)]' : 'grid-cols-[minmax(0,1fr)]'
                  )}
                >
                  {block.message.nick ? (
                    <div className="pt-0.5">
                      <MessageAvatar nick={block.message.nick} />
                    </div>
                  ) : null}
                  <div className="min-w-0">
                    <div className="mb-1 flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                      <span>{formatMessageTime(block.message.ts)}</span>
                      {block.message.nick ? <span className="font-medium text-foreground">{block.message.nick}</span> : null}
                      {showKindLabel(block.message) ? <span>{block.message.kind}</span> : null}
                    </div>
                    <p
                      className={cn(
                        'whitespace-pre-wrap break-words font-sans text-[13px] leading-5 text-foreground',
                        isActionBody(block.message) && 'italic'
                      )}
                    >
                      <FormattedMessageText text={block.message.body} mode={props.mode} onOpenChannel={props.onOpenChannel} />
                    </p>
                  </div>
                </div>
              </article>
            )
          )}
        </div>
      )}
    </div>
  );
});
