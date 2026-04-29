import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  BufferState,
  ChannelUserState,
  ChatMessage,
  MutedNickState,
  NickEmojiState,
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
import { isMessageMuted } from './muted-nick-utils.js';
import { buildNickEmojiByNetworkNick } from './nick-emoji-utils.js';

type ChatPaneMessageListProps = {
  selectedBuffer: BufferState | null;
  channelUsers?: ChannelUserState[];
  nickEmojis?: NickEmojiState[];
  followOutputRequestId?: number;
  messages: ChatMessage[];
  mutedNicks: MutedNickState[];
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

  if (typeof window === 'undefined') {
    return (
      <ChatTranscriptStatic
        channelUserModesByNick={channelUserModesByNick}
        emptyBody={props.emptyBody}
        nickEmojiByNetworkNick={nickEmojiByNetworkNick}
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
  }

  return (
    <ChatTranscriptVirtuoso
      bufferId={props.selectedBuffer?.id ?? null}
      channelUserModesByNick={channelUserModesByNick}
      emptyBody={props.emptyBody}
      nickEmojiByNetworkNick={nickEmojiByNetworkNick}
      followOutputRequestId={props.followOutputRequestId ?? 0}
      initialHistoryPending={props.initialHistoryPending}
      initialScrollTarget={initialScrollTarget}
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

export const resolveMutedAwareUnreadDividerIndex = (
  unreadDividerIndex: number | null,
  messages: readonly ChatMessage[],
  mutedNicks: readonly MutedNickState[],
) => {
  if (unreadDividerIndex === null) {
    return null;
  }
  for (let index = unreadDividerIndex; index < messages.length; index += 1) {
    const message = messages[index]!;
    if (!message.self && !isMessageMuted(mutedNicks, message)) {
      return index;
    }
  }
  return null;
};

export const pruneExpandedMutedGroupKeys = (
  current: ReadonlySet<string>,
  model: Pick<ReturnType<typeof buildChatTranscriptModel>, 'flatRows'>,
) => {
  if (current.size === 0) {
    return current;
  }
  const visibleKeys = new Set(
    model.flatRows.flatMap((row) =>
      row.kind === 'muted-group' ? [row.key] : [],
    ),
  );
  let changed = false;
  const next = new Set<string>();
  for (const key of current) {
    if (visibleKeys.has(key)) {
      next.add(key);
      continue;
    }
    changed = true;
  }
  return changed ? next : current;
};
