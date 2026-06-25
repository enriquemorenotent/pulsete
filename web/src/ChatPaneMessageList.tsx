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
import { buildChatTranscriptModel, pruneExpandedMutedGroupKeys } from './transcript/model.js';
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
  const transcriptModel = useMemo(
    () =>
      buildChatTranscriptModel({
        firstUnreadDividerIndex,
        listKind: props.listKind,
        messages: props.messages,
        mutedNicks: props.mutedNicks,
        unreadDividerKey: `unread-divider:${props.selectedBuffer?.id ?? 'none'}`,
      }),
    [firstUnreadDividerIndex, props.listKind, props.messages, props.mutedNicks, props.selectedBuffer?.id],
  );
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
      jumpToLatestRequestId={props.jumpToLatestRequestId ?? 0}
      initialHistoryPending={props.initialHistoryPending}
      initialScrollTarget={initialScrollTarget}
      inlineImageRendering={props.inlineImageRendering}
      listKind={props.listKind}
      loadingOlderHistory={props.loadingOlderHistory}
      mode={props.mode}
      model={transcriptModel}
      expandedMutedGroupKeys={expandedMutedGroupKeys}
      onLoadOlderHistory={loadOlderHistory}
      onToggleMutedGroup={toggleMutedGroup}
      onOpenChannel={props.onOpenChannel}
      onOpenParticipantQuery={props.onOpenParticipantQuery}
      participantHighlightMode={participantHighlightMode}
    />
  );
});
