import {
  forwardRef,
  memo,
  useCallback,
  useMemo,
  type ComponentPropsWithoutRef,
} from 'react';
import { Virtuoso } from 'react-virtuoso';
import type { ChannelUserMode } from '../../shared/protocol-chat.js';
import type { NetworkUserIdentity } from '../../shared/user-identity.js';
import { Button } from '@/components/ui/button.js';
import { TranscriptEmptyState } from './ChatPaneTranscriptDecorations.js';
import type { ChatTranscriptModel } from './transcript/model.js';
import { ChatTranscriptRow } from './ChatTranscriptRow.js';
import type { MessageDisplayMode } from './message-display-mode.js';
import type { ParticipantHighlightMode } from './message-participant-presentation.js';
import type { InlineImageRenderingMode } from './FormattedMessageText.js';
import {
  useTranscriptViewport,
  type TranscriptInitialScrollTarget,
} from './transcript/viewport.js';
import { handleTranscriptCopy } from './transcript/copy.js';

type ChatTranscriptVirtuosoProps = {
  bufferId: string | null;
  channelUserModesByNick: ReadonlyMap<string, ChannelUserMode>;
  emptyBody: string;
  expandedMutedGroupKeys: ReadonlySet<string>;
  nickEmojiByNetworkNick: ReadonlyMap<string, string>;
  followOutputRequestId: number;
  focusRequestId: number;
  focusRowIndex: number | null;
  highlightedMessageId?: string | null;
  initialHistoryPending?: boolean;
  initialScrollTarget: TranscriptInitialScrollTarget;
  inlineImageRendering?: InlineImageRenderingMode;
  jumpToLatestRequestId: number;
  listKind: 'chat' | 'server';
  loadingOlderHistory?: boolean;
  mode: MessageDisplayMode;
  model: ChatTranscriptModel;
  onOpenChannel: (channel: string) => void;
  onOpenParticipantQuery?: (nick: string, identity?: NetworkUserIdentity | null) => void;
  onLoadOlderHistory?: () => Promise<number>;
  onToggleMutedGroup: (key: string) => void;
  canPinMessages?: boolean;
  onSetMessagePinned?: (bufferId: string, messageId: string, pinned: boolean) => Promise<boolean>;
  hasNewerHistory?: boolean;
  onReturnToLatest?: () => Promise<boolean>;
  participantHighlightMode: ParticipantHighlightMode;
};

const TranscriptList = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<'div'>>(
  function TranscriptList(props, ref) {
    return (
      <div
        {...props}
        ref={ref}
        className="box-border px-4 py-4 pt-0"
      />
    );
  },
);

export const resolveTranscriptVirtuosoItemKey = (
  index: number,
  model: Pick<ChatTranscriptModel, 'flatRows'>,
  firstItemIndex: number,
) => {
  return model.flatRows[index - firstItemIndex]?.key ?? `transcript:${index}`;
};

export const resolveTranscriptVirtuosoRow = (
  itemIndex: number,
  model: Pick<ChatTranscriptModel, 'flatRows'>,
  firstItemIndex: number,
) => model.flatRows[itemIndex - firstItemIndex] ?? null;

export const ChatTranscriptVirtuoso = memo(function ChatTranscriptVirtuoso(
  props: ChatTranscriptVirtuosoProps,
) {
  const rowKeys = useMemo(
    () => props.model.flatRows.map((row) => row.key),
    [props.model.flatRows],
  );
  const viewport = useTranscriptViewport({
    bufferId: props.bufferId,
    followOutputRequestId: props.followOutputRequestId,
    focusRequestId: props.focusRequestId,
    focusRowIndex: props.focusRowIndex,
    initialHistoryPending: props.initialHistoryPending ?? false,
    initialScrollTarget: props.initialScrollTarget,
    jumpToLatestRequestId: props.jumpToLatestRequestId,
    loadingOlderHistory: props.loadingOlderHistory ?? false,
    onLoadOlderHistory: props.onLoadOlderHistory,
    rowKeys,
    totalItemCount: props.model.flatRows.length,
    unreadRowIndex: props.model.unreadRowIndex,
  });
  const components = useMemo(
    () => ({
      Header: props.onLoadOlderHistory
        ? () => (
            <div className="mb-2 flex justify-center">
              <Button
                variant="outline"
                size="sm"
                disabled={props.loadingOlderHistory}
                onClick={() => void viewport.handleLoadOlderHistory()}
              >
                {props.loadingOlderHistory ? 'Loading older...' : 'Load older'}
              </Button>
            </div>
          )
        : undefined,
      List: TranscriptList,
    }),
    [
      props.loadingOlderHistory,
      props.onLoadOlderHistory,
      viewport.handleLoadOlderHistory,
    ],
  );
  const computeItemKey = useCallback(
    (index: number) =>
      resolveTranscriptVirtuosoItemKey(
        index,
        props.model,
        viewport.firstItemIndex,
      ),
    [props.model, viewport.firstItemIndex],
  );
  const renderItemContent = useCallback(
    (index: number) => {
      const row = resolveTranscriptVirtuosoRow(
        index,
        props.model,
        viewport.firstItemIndex,
      );
      if (!row) {
        return null;
      }
      return (
        <ChatTranscriptRow
          row={row}
          channelUserModesByNick={props.channelUserModesByNick}
          expandedMutedGroupKeys={props.expandedMutedGroupKeys}
          highlightedMessageId={props.highlightedMessageId}
          canPinMessages={props.canPinMessages}
          onSetMessagePinned={props.onSetMessagePinned}
          inlineImageRendering={props.inlineImageRendering}
          nickEmojiByNetworkNick={props.nickEmojiByNetworkNick}
          listKind={props.listKind}
          mode={props.mode}
          onInlinePreviewLoad={viewport.handleInlinePreviewLoad}
          onOpenChannel={props.onOpenChannel}
          onOpenParticipantQuery={props.onOpenParticipantQuery}
          onToggleMutedGroup={props.onToggleMutedGroup}
          participantHighlightMode={props.participantHighlightMode}
        />
      );
    },
    [
      props.channelUserModesByNick,
      props.expandedMutedGroupKeys,
      props.highlightedMessageId,
      props.canPinMessages,
      props.inlineImageRendering,
      props.nickEmojiByNetworkNick,
      props.listKind,
      props.mode,
      props.model,
      props.onOpenChannel,
      props.onOpenParticipantQuery,
      props.onSetMessagePinned,
      props.onToggleMutedGroup,
      props.participantHighlightMode,
      viewport.firstItemIndex,
      viewport.handleInlinePreviewLoad,
    ],
  );

  if (props.model.flatRows.length === 0) {
    return (
      <div className="chat-transcript-scrollbar h-full overflow-y-auto px-4 py-4 pt-0">
        <TranscriptEmptyState body={props.emptyBody} />
      </div>
    );
  }

  return (
    <div className="relative min-h-0 flex-1" onCopy={handleTranscriptCopy}>
      <Virtuoso
        ref={viewport.virtuosoRef}
        className="chat-transcript-scrollbar"
        style={{ height: '100%' }}
        alignToBottom
        atBottomStateChange={viewport.handleAtBottomStateChange}
        atTopStateChange={viewport.handleAtTopStateChange}
        atTopThreshold={viewport.atTopThreshold}
        components={components}
        computeItemKey={computeItemKey}
        firstItemIndex={viewport.firstItemIndex}
        followOutput={viewport.followOutput}
        increaseViewportBy={{ bottom: 320, top: 160 }}
        itemContent={renderItemContent}
        itemsRendered={viewport.handleItemsRendered}
        scrollerRef={viewport.scrollerRef}
        startReached={viewport.handleStartReached}
        totalCount={props.model.flatRows.length}
      />
      {props.hasNewerHistory && props.onReturnToLatest ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 z-20 flex justify-center">
          <Button
            variant="secondary"
            size="sm"
            className="pointer-events-auto shadow-lg"
            onClick={() => void props.onReturnToLatest?.()}
          >
            Return to latest
          </Button>
        </div>
      ) : null}
    </div>
  );
});
