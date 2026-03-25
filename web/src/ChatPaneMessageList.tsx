import { memo, useMemo, type RefObject } from 'react';
import { Plug2 } from 'lucide-react';
import type { BufferState, ChatMessage } from '../../shared/protocol.js';
import { cn } from '@/lib/utils.js';
import { FormattedMessageText } from './FormattedMessageText.js';
import { ChatPaneCompactMessageRow } from './ChatPaneCompactMessageRow.js';
import type { MessageDisplayMode } from './message-display-mode.js';
import {
  buildRenderBlocks,
  formatMessageTimestamp,
  getServerMessageSourceLabel,
  isActionMessage,
  isCompactMessage,
  messageTone,
  participantNickTone,
  showKindLabel,
} from './chat-pane-message-utils.js';

type ChatPaneMessageListProps = {
  bufferKind: BufferState['kind'] | null;
  messages: ChatMessage[];
  scrollRef: RefObject<HTMLDivElement | null>;
  emptyBody: string;
  mode: MessageDisplayMode;
  listKind: 'chat' | 'server';
  onOpenChannel: (channel: string) => void;
};

export const ChatPaneMessageList = memo(function ChatPaneMessageList(props: ChatPaneMessageListProps) {
  const highlightParticipantNicks = props.bufferKind === 'query';
  const renderBlocks = useMemo(
    () => buildRenderBlocks(props.messages),
    [props.messages]
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
        <div className="space-y-1 font-mono text-[12px]">
          {renderBlocks.map((block) => {
            const serverSourceLabel =
              props.listKind === 'server'
                ? getServerMessageSourceLabel(block.message)
                : null;
            const shouldUseCompactRow = props.listKind === 'server' || isCompactMessage(block.message);

            return shouldUseCompactRow ? (
              <ChatPaneCompactMessageRow
                key={block.message.id}
                highlightParticipantNicks={highlightParticipantNicks}
                message={block.message}
                senderLabel={serverSourceLabel}
                showKindBadge={props.listKind === 'server' ? !!(block.message.nick && showKindLabel(block.message)) : undefined}
                mode={props.mode}
                onOpenChannel={props.onOpenChannel}
              />
            ) : (
              <article key={block.message.id} className={cn('px-1 py-0.5 text-foreground', messageTone(block.message))}>
                <div className="min-w-0">
                  <div className="mb-1 flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                    <span className="tabular-nums normal-case tracking-normal">{formatMessageTimestamp(block.message.ts)}</span>
                    {block.message.nick ? (
                      <span className={cn('font-medium', participantNickTone(block.message, highlightParticipantNicks))}>
                        {block.message.nick}
                      </span>
                    ) : null}
                    {showKindLabel(block.message) ? <span>{block.message.kind}</span> : null}
                  </div>
                  <p
                    className={cn(
                      'whitespace-pre-wrap break-words font-sans text-[13px] leading-5 text-inherit',
                      isActionMessage(block.message) && 'italic'
                    )}
                  >
                    <FormattedMessageText text={block.message.body} mode={props.mode} onOpenChannel={props.onOpenChannel} />
                  </p>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
});
