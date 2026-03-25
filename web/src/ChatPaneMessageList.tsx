import { memo, useCallback, useMemo, useRef, type RefObject, type UIEvent } from 'react';
import { Plug2 } from 'lucide-react';
import type { BufferState, ChatMessage } from '../../shared/protocol.js';
import { Button } from '@/components/ui/button.js';
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
  canLoadOlderHistory?: boolean;
  loadingOlderHistory?: boolean;
  onOpenChannel: (channel: string) => void;
  onLoadOlderHistory?: () => Promise<void>;
};

export const ChatPaneMessageList = memo(function ChatPaneMessageList(props: ChatPaneMessageListProps) {
  const highlightParticipantNicks = props.bufferKind === 'query';
  const loadingOlderRef = useRef(false);
  const renderBlocks = useMemo(
    () => buildRenderBlocks(props.messages),
    [props.messages]
  );
  const showLoadOlder = props.canLoadOlderHistory && props.onLoadOlderHistory;
  const handleLoadOlder = useCallback(async () => {
    if (!props.onLoadOlderHistory || loadingOlderRef.current || props.loadingOlderHistory) {
      return;
    }
    loadingOlderRef.current = true;
    const scrollContainer = props.scrollRef.current;
    const previousHeight = scrollContainer?.scrollHeight ?? 0;
    const previousTop = scrollContainer?.scrollTop ?? 0;
    try {
      await props.onLoadOlderHistory();
      await waitForNextAnimationFrame();
      const nextScrollContainer = props.scrollRef.current;
      if (!nextScrollContainer) {
        return;
      }
      restoreScrollOffsetAfterPrepend(nextScrollContainer, previousHeight, previousTop);
    } finally {
      loadingOlderRef.current = false;
    }
  }, [props.loadingOlderHistory, props.onLoadOlderHistory, props.scrollRef]);

  const handleScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    if (!shouldAutoLoadOlderHistory({
      canLoadOlderHistory: !!showLoadOlder,
      loadingOlderHistory: props.loadingOlderHistory ?? false,
      loadingOlderInFlight: loadingOlderRef.current,
      scrollTop: event.currentTarget.scrollTop,
    })) {
      return;
    }
    void handleLoadOlder();
  }, [handleLoadOlder, props.loadingOlderHistory, showLoadOlder]);

  return (
    <div
      ref={props.scrollRef}
      className="min-h-0 flex-1 overflow-y-auto bg-background/45 px-3 py-2"
      onScroll={handleScroll}
    >
      {showLoadOlder ? (
        <div className="mb-2 flex justify-center">
          <Button variant="outline" size="sm" disabled={props.loadingOlderHistory} onClick={() => void handleLoadOlder()}>
            {props.loadingOlderHistory ? 'Loading older...' : 'Load older'}
          </Button>
        </div>
      ) : null}
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

const waitForNextAnimationFrame = () =>
  new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });

const olderHistoryAutoLoadThresholdPx = 24;

export const shouldAutoLoadOlderHistory = (input: {
  canLoadOlderHistory: boolean;
  loadingOlderHistory: boolean;
  loadingOlderInFlight: boolean;
  scrollTop: number;
}) =>
  input.canLoadOlderHistory
  && !input.loadingOlderHistory
  && !input.loadingOlderInFlight
  && input.scrollTop <= olderHistoryAutoLoadThresholdPx;

export const restoreScrollOffsetAfterPrepend = (
  node: Pick<HTMLDivElement, 'scrollHeight' | 'scrollTop'>,
  previousHeight: number,
  previousTop: number,
) => {
  node.scrollTop = previousTop + (node.scrollHeight - previousHeight);
};
