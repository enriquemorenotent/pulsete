import { memo, useCallback, useLayoutEffect, useMemo, useRef, type RefObject, type UIEvent } from 'react';
import { Plug2 } from 'lucide-react';
import type { BufferState, ChannelUserState, ChatMessage } from '../../shared/protocol.js';
import { Button } from '@/components/ui/button.js';
import { cn } from '@/lib/utils.js';
import {
  captureUnreadDividerAnchor,
  resolveInitialTranscriptScrollTarget,
  resolveVisibleUnreadDividerIndex,
  type UnreadDividerAnchor,
} from './buffer-activity.js';
import { FormattedMessageText } from './FormattedMessageText.js';
import { ChatPaneCompactMessageRow } from './ChatPaneCompactMessageRow.js';
import type { MessageDisplayMode } from './message-display-mode.js';
import type { MessageParticipantPresentation } from './message-participant-presentation.js';
import {
  buildChannelUserModesByNick,
  resolveMessageParticipantPresentation,
  resolveParticipantHighlightMode,
} from './message-participant-presentation.js';
import { ParticipantNickLabel } from './ParticipantNickLabel.js';
import {
  buildRenderBlocks,
  formatMessageTimestamp,
  getServerMessageSourceLabel,
  isActionMessage,
  isCompactMessage,
  messageTone,
} from './chat-pane-message-utils.js';
import { refreshStickyScrollMode, scrollNodeToBottom } from './useStickyScroll.js';

type ChatPaneMessageListProps = {
  selectedBuffer: BufferState | null;
  channelUsers?: ChannelUserState[];
  messages: ChatMessage[];
  scrollRef: RefObject<HTMLDivElement | null>;
  emptyBody: string;
  mode: MessageDisplayMode;
  listKind: 'chat' | 'server';
  canLoadOlderHistory?: boolean;
  loadingOlderHistory?: boolean;
  onOpenChannel: (channel: string) => void;
  onOpenParticipantQuery?: (nick: string) => void;
  onLoadOlderHistory?: () => Promise<void>;
};

export const ChatPaneMessageList = memo(function ChatPaneMessageList(props: ChatPaneMessageListProps) {
  const participantHighlightMode = resolveParticipantHighlightMode(props.selectedBuffer?.kind ?? null);
  const unreadDividerAnchorRef = useRef<UnreadDividerAnchor | null>(null);
  const unreadDividerAnchor = captureUnreadDividerAnchor(props.selectedBuffer, unreadDividerAnchorRef.current);
  unreadDividerAnchorRef.current = unreadDividerAnchor;
  const channelUserModesByNick = useMemo(
    () => buildChannelUserModesByNick(props.channelUsers),
    [props.channelUsers]
  );
  const firstUnreadDividerIndex = useMemo(
    () => resolveVisibleUnreadDividerIndex(props.messages, props.selectedBuffer, unreadDividerAnchor),
    [props.messages, props.selectedBuffer, unreadDividerAnchor]
  );
  const loadingOlderRef = useRef(false);
  const positionedBufferIdRef = useRef<string | null>(null);
  const unreadDividerRef = useRef<HTMLDivElement | null>(null);
  const renderBlocks = useMemo(
    () => buildRenderBlocks(props.messages),
    [props.messages]
  );
  const showLoadOlder = props.canLoadOlderHistory && props.onLoadOlderHistory;
  const initialScrollTarget = resolveInitialTranscriptScrollTarget({
    buffer: props.selectedBuffer,
    firstUnreadDividerIndex,
    listKind: props.listKind,
    messagesLength: props.messages.length,
  });
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

  useLayoutEffect(() => {
    const scrollContainer = props.scrollRef.current;
    const bufferId = props.selectedBuffer?.id ?? null;
    if (!scrollContainer || !bufferId) {
      positionedBufferIdRef.current = null;
      return;
    }
    if (positionedBufferIdRef.current === bufferId || initialScrollTarget === 'wait') {
      return;
    }
    if (initialScrollTarget === 'first-unread' && unreadDividerRef.current) {
      unreadDividerRef.current.scrollIntoView({ block: 'start' });
    } else {
      scrollNodeToBottom(scrollContainer);
    }
    refreshStickyScrollMode(scrollContainer);
    positionedBufferIdRef.current = bufferId;
  }, [
    initialScrollTarget,
    props.scrollRef,
    props.selectedBuffer?.id,
  ]);

  return (
    <div
      ref={props.scrollRef}
      className="min-h-0 flex-1 overflow-y-auto px-4 py-4"
      onScroll={handleScroll}
    >
      {showLoadOlder ? (
        <div className="mb-2 flex justify-center" data-scroll-anchor-item>
          <Button variant="outline" size="sm" disabled={props.loadingOlderHistory} onClick={() => void handleLoadOlder()}>
            {props.loadingOlderHistory ? 'Loading older...' : 'Load older'}
          </Button>
        </div>
      ) : null}
      {props.messages.length === 0 ? (
        <div className="flex h-full items-center justify-center" data-scroll-anchor-item>
          <div className="w-full max-w-md rounded-[1.25rem] bg-white/[0.03] px-5 py-6 text-center ring-1 ring-white/[0.06]">
            <div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-full bg-white/[0.05] text-muted-foreground">
              <Plug2 className="size-4 text-muted-foreground" />
            </div>
            <p className="text-[13px] leading-6 text-muted-foreground">{props.emptyBody}</p>
          </div>
        </div>
      ) : (
        <div className="space-y-1.5 font-mono text-[12px]" data-scroll-anchor-item>
          {renderBlocks.map((block, index) => {
            const serverSourceLabel =
              props.listKind === 'server'
                ? getServerMessageSourceLabel(block.message)
                : null;
            const shouldUseCompactRow = props.listKind === 'server' || isCompactMessage(block.message);
            const participant = resolveMessageParticipantPresentation({
              message: block.message,
              listKind: props.listKind,
              rowVariant: shouldUseCompactRow ? 'compact' : 'full',
              senderLabel: serverSourceLabel,
              highlightMode: participantHighlightMode,
              channelUserModesByNick,
              allowParticipantQuery: !!props.onOpenParticipantQuery,
            });

            return (
              <div key={block.message.id}>
                {firstUnreadDividerIndex === index ? (
                  <div ref={unreadDividerRef} data-unread-divider>
                    <UnreadDivider />
                  </div>
                ) : null}
                {shouldUseCompactRow ? (
                  <ChatPaneCompactMessageRow
                    message={block.message}
                    participant={participant}
                    mode={props.mode}
                    onOpenChannel={props.onOpenChannel}
                    onOpenParticipantQuery={props.onOpenParticipantQuery}
                  />
                ) : (
                  <article className={cn('px-1 py-0.5 text-foreground', messageTone(block.message))}>
                    <div className="min-w-0">
                      <div className="mb-1 flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                        <span className="tabular-nums normal-case tracking-normal">{formatMessageTimestamp(block.message.ts)}</span>
                        {participant.label ? (
                          <ParticipantNickLabel
                            nick={participant.label}
                            clickable={participant.clickable}
                            onOpenParticipantQuery={props.onOpenParticipantQuery}
                            className={cn('font-medium', participant.toneClassName)}
                          />
                        ) : null}
                        {renderKindBadge(participant)}
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
                )}
              </div>
            );
          })}
        </div>
      )}
      <div aria-hidden className="h-px w-full" data-scroll-anchor-end />
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

const renderKindBadge = (participant: MessageParticipantPresentation) =>
  participant.kindBadgeLabel ? <span>{participant.kindBadgeLabel}</span> : null;

const UnreadDivider = () => (
  <div className="my-3 flex items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-primary">
    <span className="h-px flex-1 bg-primary/35" />
    <span>New messages</span>
    <span className="h-px flex-1 bg-primary/35" />
  </div>
);
