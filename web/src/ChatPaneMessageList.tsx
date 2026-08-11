import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BufferState, ChannelUserState, ChatMessage, MutedNickState, NickEmojiState } from '../../shared/protocol-chat.js';
import type { NetworkUserIdentity } from '../../shared/user-identity.js';
import {
  captureUnreadDividerAnchor,
  resolveInitialTranscriptScrollTarget,
  resolveMutedAwareUnreadDividerIndex,
  resolveVisibleUnreadDividerIndex,
  type UnreadDividerAnchor,
} from './transcript/unread-state.js';
import { buildChannelUserModesByNick, resolveParticipantHighlightMode } from './message-participant-presentation.js';
import {
  pruneExpandedMutedGroupKeys,
  resolveTranscriptMessageLocation,
} from './transcript/model.js';
import { useChatTranscriptModel } from './transcript/use-chat-transcript-model.js';
import { ChatTranscriptStatic } from './ChatTranscriptStatic.js';
import { ChatTranscriptVirtuoso } from './ChatTranscriptVirtuoso.js';
import { TranscriptLoadingState } from './ChatPaneTranscriptDecorations.js';
import type { MessageDisplayMode } from './message-display-mode.js';
import { buildNickEmojiByNetworkNick } from './nick-emoji-utils.js';
import type { InlineImageRenderingMode } from './FormattedMessageText.js';

type ChatPaneMessageListProps = {
  selectedBuffer: BufferState | null;
  channelUsers?: ChannelUserState[];
  nickEmojis?: NickEmojiState[];
  followOutputRequestId?: number;
  jumpToLatestRequestId?: number;
  messageFocusRequest?: {
    bufferId: string;
    messageId: string;
    requestId: number;
  } | null;
  messages: ChatMessage[];
  mutedNicks: MutedNickState[];
  emptyBody: string;
  inlineImageRendering?: InlineImageRenderingMode;
  mode: MessageDisplayMode;
  listKind: 'chat' | 'server';
  canLoadOlderHistory?: boolean;
  initialHistoryPending?: boolean;
  loadingOlderHistory?: boolean;
  onOpenChannel: (channel: string) => void;
  onOpenParticipantQuery?: (nick: string, identity?: NetworkUserIdentity | null) => void;
  onLoadOlderHistory?: () => Promise<number>;
  hasNewerHistory?: boolean;
  onReturnToLatest?: () => Promise<boolean>;
  canPinMessages?: boolean;
  onSetMessagePinned?: (bufferId: string, messageId: string, pinned: boolean) => Promise<boolean>;
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
  useEffect(() => {
    unreadDividerAnchorRef.current = unreadDividerAnchor;
  }, [unreadDividerAnchor]);
  const [expandedMutedGroupKeys, setExpandedMutedGroupKeys] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const toggleMutedGroup = useCallback((key: string) => {
    setExpandedMutedGroupKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const firstUnreadDividerIndex = useMemo(
    () => {
      const unreadDividerIndex = resolveVisibleUnreadDividerIndex(
        props.messages,
        props.selectedBuffer,
        unreadDividerAnchor,
      );
      return resolveMutedAwareUnreadDividerIndex(
        unreadDividerIndex,
        props.messages,
        props.mutedNicks,
      );
    },
    [props.messages, props.mutedNicks, props.selectedBuffer, unreadDividerAnchor],
  );
  const transcriptModelInput = useMemo(
    () => ({
      firstUnreadDividerIndex,
      listKind: props.listKind,
      messages: props.messages,
      mutedNicks: props.mutedNicks,
      unreadDividerKey: `unread-divider:${props.selectedBuffer?.id ?? 'none'}`,
    }),
    [firstUnreadDividerIndex, props.listKind, props.messages, props.mutedNicks, props.selectedBuffer?.id],
  );
  const transcriptModel = useChatTranscriptModel(transcriptModelInput);
  const activeFocusRequest =
    props.messageFocusRequest?.bufferId === props.selectedBuffer?.id
      ? props.messageFocusRequest
      : null;
  const focusedMessageLocation = useMemo(
    () => activeFocusRequest
      ? resolveTranscriptMessageLocation(transcriptModel, activeFocusRequest.messageId)
      : null,
    [activeFocusRequest, transcriptModel],
  );
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  useEffect(() => {
    if (!activeFocusRequest || !focusedMessageLocation) {
      setHighlightedMessageId(null);
      return;
    }
    const mutedGroupKey = focusedMessageLocation.mutedGroupKey;
    if (mutedGroupKey) {
      setExpandedMutedGroupKeys((current) => {
        if (current.has(mutedGroupKey)) {
          return current;
        }
        const next = new Set(current);
        next.add(mutedGroupKey);
        return next;
      });
    }
    setHighlightedMessageId(activeFocusRequest.messageId);
    const timer = window.setTimeout(() => {
      setHighlightedMessageId((current) =>
        current === activeFocusRequest.messageId ? null : current,
      );
    }, 2_000);
    return () => window.clearTimeout(timer);
  }, [activeFocusRequest, focusedMessageLocation]);
  useEffect(() => {
    setExpandedMutedGroupKeys((current) =>
      pruneExpandedMutedGroupKeys(current, transcriptModel),
    );
  }, [transcriptModel]);
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
  const nickEmojiByNetworkNick = useMemo(
    () => buildNickEmojiByNetworkNick(props.nickEmojis ?? []),
    [props.nickEmojis],
  );
  const loadOlderHistory =
    props.canLoadOlderHistory && props.onLoadOlderHistory
      ? props.onLoadOlderHistory
      : undefined;

  if (props.initialHistoryPending) {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 pt-0">
        <TranscriptLoadingState />
      </div>
    );
  }

  if (typeof window === 'undefined') {
    return (
      <ChatTranscriptStatic
        channelUserModesByNick={channelUserModesByNick}
        emptyBody={props.emptyBody}
        nickEmojiByNetworkNick={nickEmojiByNetworkNick}
        listKind={props.listKind}
        loadingOlderHistory={props.loadingOlderHistory}
        inlineImageRendering={props.inlineImageRendering}
        mode={props.mode}
        model={transcriptModel}
        expandedMutedGroupKeys={expandedMutedGroupKeys}
        highlightedMessageId={highlightedMessageId}
        canPinMessages={props.canPinMessages}
        onSetMessagePinned={props.onSetMessagePinned}
        hasNewerHistory={props.hasNewerHistory}
        onReturnToLatest={props.onReturnToLatest}
        onLoadOlderHistory={loadOlderHistory}
        onToggleMutedGroup={toggleMutedGroup}
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
      nickEmojiByNetworkNick={nickEmojiByNetworkNick}
      followOutputRequestId={props.followOutputRequestId ?? 0}
      focusRequestId={activeFocusRequest?.requestId ?? 0}
      focusRowIndex={focusedMessageLocation?.rowIndex ?? null}
      jumpToLatestRequestId={props.jumpToLatestRequestId ?? 0}
      initialHistoryPending={props.initialHistoryPending}
      initialScrollTarget={initialScrollTarget}
      inlineImageRendering={props.inlineImageRendering}
      listKind={props.listKind}
      loadingOlderHistory={props.loadingOlderHistory}
      mode={props.mode}
      model={transcriptModel}
      expandedMutedGroupKeys={expandedMutedGroupKeys}
      highlightedMessageId={highlightedMessageId}
      canPinMessages={props.canPinMessages}
      onSetMessagePinned={props.onSetMessagePinned}
      hasNewerHistory={props.hasNewerHistory}
      onReturnToLatest={props.onReturnToLatest}
      onLoadOlderHistory={loadOlderHistory}
      onToggleMutedGroup={toggleMutedGroup}
      onOpenChannel={props.onOpenChannel}
      onOpenParticipantQuery={props.onOpenParticipantQuery}
      participantHighlightMode={participantHighlightMode}
    />
  );
});
