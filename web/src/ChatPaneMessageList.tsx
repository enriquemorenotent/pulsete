import { memo, useMemo, useRef } from 'react';
import type {
  BufferState,
  ChannelUserState,
  ChatMessage,
} from '../../shared/protocol.js';
import {
  captureUnreadDividerAnchor,
  resolveInitialTranscriptScrollTarget,
  resolveVisibleUnreadDividerIndex,
  type UnreadDividerAnchor,
} from './buffer-activity.js';
import { buildChannelUserModesByNick, resolveParticipantHighlightMode } from './message-participant-presentation.js';
import { buildChatTranscriptModel } from './chat-transcript-model.js';
import { ChatTranscriptStatic } from './ChatTranscriptStatic.js';
import { ChatTranscriptVirtuoso } from './ChatTranscriptVirtuoso.js';
import type { MessageDisplayMode } from './message-display-mode.js';

type ChatPaneMessageListProps = {
  selectedBuffer: BufferState | null;
  channelUsers?: ChannelUserState[];
  followOutputRequestId?: number;
  messages: ChatMessage[];
  emptyBody: string;
  mode: MessageDisplayMode;
  listKind: 'chat' | 'server';
  canLoadOlderHistory?: boolean;
  initialHistoryPending?: boolean;
  loadingOlderHistory?: boolean;
  onOpenChannel: (channel: string) => void;
  onOpenParticipantQuery?: (nick: string) => void;
  onLoadOlderHistory?: () => Promise<number>;
};

export const ChatPaneMessageList = memo(function ChatPaneMessageList(
  props: ChatPaneMessageListProps,
) {
  const participantHighlightMode = resolveParticipantHighlightMode(
    props.selectedBuffer?.kind ?? null,
  );
  const unreadDividerAnchorRef = useRef<UnreadDividerAnchor | null>(null);
  const unreadDividerAnchor = captureUnreadDividerAnchor(
    props.selectedBuffer,
    unreadDividerAnchorRef.current,
  );
  unreadDividerAnchorRef.current = unreadDividerAnchor;

  const firstUnreadDividerIndex = useMemo(
    () =>
      resolveVisibleUnreadDividerIndex(
        props.messages,
        props.selectedBuffer,
        unreadDividerAnchor,
      ),
    [props.messages, props.selectedBuffer, unreadDividerAnchor],
  );
  const transcriptModel = useMemo(
    () =>
      buildChatTranscriptModel({
        firstUnreadDividerIndex,
        listKind: props.listKind,
        messages: props.messages,
        unreadDividerKey: `unread-divider:${props.selectedBuffer?.id ?? 'none'}`,
      }),
    [firstUnreadDividerIndex, props.listKind, props.messages, props.selectedBuffer?.id],
  );
  const initialScrollTarget = resolveInitialTranscriptScrollTarget({
    buffer: props.selectedBuffer,
    firstUnreadDividerIndex,
    listKind: props.listKind,
    messagesLength: props.messages.length,
  });
  const channelUserModesByNick = useMemo(
    () => buildChannelUserModesByNick(props.channelUsers),
    [props.channelUsers],
  );
  const loadOlderHistory =
    props.canLoadOlderHistory && props.onLoadOlderHistory
      ? props.onLoadOlderHistory
      : undefined;

  if (typeof window === 'undefined') {
    return (
      <ChatTranscriptStatic
        channelUserModesByNick={channelUserModesByNick}
        emptyBody={props.emptyBody}
        listKind={props.listKind}
        loadingOlderHistory={props.loadingOlderHistory}
        mode={props.mode}
        model={transcriptModel}
        onLoadOlderHistory={loadOlderHistory}
        onOpenChannel={props.onOpenChannel}
        onOpenParticipantQuery={props.onOpenParticipantQuery}
        participantHighlightMode={participantHighlightMode}
      />
    );
  }

  return (
    <ChatTranscriptVirtuoso
      bufferId={props.selectedBuffer?.id ?? null}
      channelUserModesByNick={channelUserModesByNick}
      emptyBody={props.emptyBody}
      followOutputRequestId={props.followOutputRequestId ?? 0}
      initialHistoryPending={props.initialHistoryPending}
      initialScrollTarget={initialScrollTarget}
      listKind={props.listKind}
      loadingOlderHistory={props.loadingOlderHistory}
      mode={props.mode}
      model={transcriptModel}
      onLoadOlderHistory={loadOlderHistory}
      onOpenChannel={props.onOpenChannel}
      onOpenParticipantQuery={props.onOpenParticipantQuery}
      participantHighlightMode={participantHighlightMode}
    />
  );
});
