import type { ChannelUserMode } from '../../shared/protocol.js';
import { ChatPaneMutedMessageGroupRow } from './ChatPaneMutedMessageGroupRow.js';
import { UnreadDivider } from './ChatPaneTranscriptDecorations.js';
import type { ChatTranscriptRow as TranscriptRow } from './chat-transcript-model.js';
import { ChatTranscriptMessageRow } from './ChatTranscriptMessageRow.js';
import type { MessageDisplayMode } from './message-display-mode.js';
import type { ParticipantHighlightMode } from './message-participant-presentation.js';

type ChatTranscriptRowProps = {
  channelUserModesByNick: ReadonlyMap<string, ChannelUserMode>;
  expandedMutedGroupKeys: ReadonlySet<string>;
  nickEmojiByNetworkNick: ReadonlyMap<string, string>;
  listKind: 'chat' | 'server';
  mode: MessageDisplayMode;
  onInlinePreviewLoad?: () => void;
  onOpenChannel: (channel: string) => void;
  onOpenParticipantQuery?: (nick: string) => void;
  onToggleMutedGroup: (key: string) => void;
  participantHighlightMode: ParticipantHighlightMode;
  row: TranscriptRow;
};

export function ChatTranscriptRow(props: ChatTranscriptRowProps) {
  if (props.row.kind === 'unread-divider') {
    return <UnreadDivider />;
  }

  if (props.row.kind === 'muted-group') {
    return (
      <ChatPaneMutedMessageGroupRow
        row={props.row}
        channelUserModesByNick={props.channelUserModesByNick}
        expanded={props.expandedMutedGroupKeys.has(props.row.key)}
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

  return (
    <ChatTranscriptMessageRow
      row={props.row}
      channelUserModesByNick={props.channelUserModesByNick}
      nickEmojiByNetworkNick={props.nickEmojiByNetworkNick}
      listKind={props.listKind}
      mode={props.mode}
      onInlinePreviewLoad={props.onInlinePreviewLoad}
      onOpenChannel={props.onOpenChannel}
      onOpenParticipantQuery={props.onOpenParticipantQuery}
      participantHighlightMode={props.participantHighlightMode}
    />
  );
}
