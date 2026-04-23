import {
  forwardRef,
  memo,
  useMemo,
  type ComponentPropsWithoutRef,
} from 'react';
import { GroupedVirtuoso } from 'react-virtuoso';
import type { ChannelUserMode } from '../../shared/protocol.js';
import { Button } from '@/components/ui/button.js';
import { DayDivider, TranscriptEmptyState } from './ChatPaneTranscriptDecorations.js';
import type { ChatTranscriptModel } from './chat-transcript-model.js';
import { ChatTranscriptRow } from './ChatTranscriptRow.js';
import type { MessageDisplayMode } from './message-display-mode.js';
import type { ParticipantHighlightMode } from './message-participant-presentation.js';
import { useChatTranscriptViewport } from './useChatTranscriptViewport.js';

type ChatTranscriptVirtuosoProps = {
  bufferId: string | null;
  channelUserModesByNick: ReadonlyMap<string, ChannelUserMode>;
  emptyBody: string;
  followOutputRequestId: number;
  initialHistoryPending?: boolean;
  initialScrollTarget: 'bottom' | 'first-unread' | 'wait';
  listKind: 'chat' | 'server';
  loadingOlderHistory?: boolean;
  mode: MessageDisplayMode;
  model: ChatTranscriptModel;
  onOpenChannel: (channel: string) => void;
  onOpenParticipantQuery?: (nick: string) => void;
  onLoadOlderHistory?: () => Promise<number>;
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
  row: ChatTranscriptModel['flatRows'][number] | undefined,
) => row?.key ?? `group:${index}`;

export const ChatTranscriptVirtuoso = memo(function ChatTranscriptVirtuoso(
  props: ChatTranscriptVirtuosoProps,
) {
  const viewport = useChatTranscriptViewport({
    bufferId: props.bufferId,
    followOutputRequestId: props.followOutputRequestId,
    initialHistoryPending: props.initialHistoryPending ?? false,
    initialScrollTarget: props.initialScrollTarget,
    loadingOlderHistory: props.loadingOlderHistory ?? false,
    onLoadOlderHistory: props.onLoadOlderHistory,
    totalItemCount: props.model.flatRows.length,
    unreadRowIndex: props.model.unreadRowIndex,
  });
  const components = useMemo(
    () => ({
      Footer: () => <div aria-hidden className="h-px w-full" data-scroll-anchor-end />,
      Header: props.onLoadOlderHistory
        ? () => (
            <div className="mb-2 flex justify-center">
              <Button
                variant="outline"
                size="sm"
                disabled={props.loadingOlderHistory}
                onClick={() => void viewport.loadOlderHistory()}
              >
                {props.loadingOlderHistory ? 'Loading older...' : 'Load older'}
              </Button>
            </div>
          )
        : undefined,
      List: TranscriptList,
    }),
    [props.loadingOlderHistory, props.onLoadOlderHistory, viewport],
  );

  if (props.model.flatRows.length === 0) {
    return (
      <div className="h-full overflow-y-auto px-4 py-4 pt-0">
        <TranscriptEmptyState body={props.emptyBody} />
      </div>
    );
  }

  return (
    <div className="relative min-h-0 flex-1">
      <GroupedVirtuoso
        ref={viewport.virtuosoRef}
        style={{ height: '100%' }}
        alignToBottom
        atBottomStateChange={viewport.handleAtBottomStateChange}
        components={components}
        computeItemKey={resolveTranscriptVirtuosoItemKey}
        data={props.model.flatRows}
        firstItemIndex={viewport.firstItemIndex}
        followOutput={viewport.followOutput}
        groupContent={(groupIndex) => (
          <DayDivider label={props.model.groups[groupIndex]?.label ?? ''} />
        )}
        groupCounts={props.model.groupCounts}
        increaseViewportBy={{ bottom: 320, top: 160 }}
        itemContent={(_index, _groupIndex, row) => (
          <ChatTranscriptRow
            row={row}
            channelUserModesByNick={props.channelUserModesByNick}
            listKind={props.listKind}
            mode={props.mode}
            onInlinePreviewLoad={viewport.handleInlinePreviewLoad}
            onOpenChannel={props.onOpenChannel}
            onOpenParticipantQuery={props.onOpenParticipantQuery}
            participantHighlightMode={props.participantHighlightMode}
          />
        )}
        scrollerRef={viewport.scrollerRef}
        startReached={viewport.startReached}
      />
      {viewport.showJumpToLatest ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-4 z-20 flex justify-center px-4">
          <Button
            variant="outline"
            size="sm"
            className="pointer-events-auto rounded-full border-white/12 bg-[#2b303a]/88 px-3.5 text-[12px] text-foreground shadow-[0_14px_32px_rgba(0,0,0,0.36)] backdrop-blur-xl hover:bg-[#333845]/92"
            onClick={viewport.handleJumpToLatest}
          >
            Jump to latest
          </Button>
        </div>
      ) : null}
    </div>
  );
});
