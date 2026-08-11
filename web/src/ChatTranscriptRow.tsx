import type { ChannelUserMode } from '../../shared/protocol-chat.js';
import type { NetworkUserIdentity } from '../../shared/user-identity.js';
import { ChatPaneMutedMessageGroupRow } from './ChatPaneMutedMessageGroupRow.js';
import { ChatPaneServerMessageGroupRow } from './ChatPaneServerMessageGroupRow.js';
import { DayDivider, UnreadDivider } from './ChatPaneTranscriptDecorations.js';
import type { ChatTranscriptRow as TranscriptRow } from './transcript/model.js';
import { ChatTranscriptMessageRow } from './ChatTranscriptMessageRow.js';
import type { MessageDisplayMode } from './message-display-mode.js';
import type { ParticipantHighlightMode } from './message-participant-presentation.js';
import type { InlineImageRenderingMode } from './FormattedMessageText.js';

type ChatTranscriptRowProps = {
  channelUserModesByNick: ReadonlyMap<string, ChannelUserMode>;
  expandedMutedGroupKeys: ReadonlySet<string>;
  highlightedMessageId?: string | null;
  inlineImageRendering?: InlineImageRenderingMode;
  nickEmojiByNetworkNick: ReadonlyMap<string, string>;
  listKind: 'chat' | 'server';
  mode: MessageDisplayMode;
  onInlinePreviewLoad?: () => void;
  onOpenChannel: (channel: string) => void;
  onOpenParticipantQuery?: (nick: string, identity?: NetworkUserIdentity | null) => void;
  onToggleMutedGroup: (key: string) => void;
  participantHighlightMode: ParticipantHighlightMode;
  canPinMessages?: boolean;
  onSetMessagePinned?: (bufferId: string, messageId: string, pinned: boolean) => Promise<boolean>;
  row: TranscriptRow;
};

export function ChatTranscriptRow(props: ChatTranscriptRowProps) {
  if (props.row.kind === 'day-divider') {
    return <DayDivider label={props.row.label} />;
  }

  if (props.row.kind === 'unread-divider') {
    return <UnreadDivider />;
  }

  if (props.row.kind === 'muted-group') {
    return (
      <ChatPaneMutedMessageGroupRow
        row={props.row}
        channelUserModesByNick={props.channelUserModesByNick}
        expanded={props.expandedMutedGroupKeys.has(props.row.key)}
        highlightedMessageId={props.highlightedMessageId}
        canPinMessages={props.canPinMessages}
        onSetMessagePinned={props.onSetMessagePinned}
        inlineImageRendering={props.inlineImageRendering}
        nickEmojiByNetworkNick={props.nickEmojiByNetworkNick}
        listKind={props.listKind}
        mode={props.mode}
        onInlinePreviewLoad={props.onInlinePreviewLoad}
        onOpenChannel={props.onOpenChannel}
        onOpenParticipantQuery={props.onOpenParticipantQuery}
        onToggle={props.onToggleMutedGroup}
        participantHighlightMode={props.participantHighlightMode}
      />
    );
  }

  if (props.row.kind === 'server-group') {
    return (
      <ChatPaneServerMessageGroupRow
        row={props.row}
        inlineImageRendering={props.inlineImageRendering}
        mode={props.mode}
        onInlinePreviewLoad={props.onInlinePreviewLoad}
        onOpenChannel={props.onOpenChannel}
      />
    );
  }

  return (
    <ChatTranscriptMessageRow
      row={props.row}
      channelUserModesByNick={props.channelUserModesByNick}
      nickEmojiByNetworkNick={props.nickEmojiByNetworkNick}
      listKind={props.listKind}
      inlineImageRendering={props.inlineImageRendering}
      mode={props.mode}
      onInlinePreviewLoad={props.onInlinePreviewLoad}
      onOpenChannel={props.onOpenChannel}
      onOpenParticipantQuery={props.onOpenParticipantQuery}
      participantHighlightMode={props.participantHighlightMode}
      highlighted={props.highlightedMessageId === props.row.message.id}
      canPinMessages={props.canPinMessages}
      onSetMessagePinned={props.onSetMessagePinned}
    />
  );
}
