import type { ChannelUserMode } from '../../shared/protocol.js';
import { ChatPaneCompactMessageRow } from './ChatPaneCompactMessageRow.js';
import { ChatPaneExpandedMessageRow } from './ChatPaneExpandedMessageRow.js';
import {
  getServerMessageSourceLabel,
  isCompactMessage,
} from './chat-pane-message-utils.js';
import type { ChatTranscriptMessageRow as TranscriptMessageRow } from './chat-transcript-model.js';
import type { MessageDisplayMode } from './message-display-mode.js';
import {
  resolveMessageParticipantPresentation,
  type ParticipantHighlightMode,
} from './message-participant-presentation.js';

type ChatTranscriptMessageRowProps = {
  channelUserModesByNick: ReadonlyMap<string, ChannelUserMode>;
  listKind: 'chat' | 'server';
  mode: MessageDisplayMode;
  onInlinePreviewLoad?: () => void;
  onOpenChannel: (channel: string) => void;
  onOpenParticipantQuery?: (nick: string) => void;
  participantHighlightMode: ParticipantHighlightMode;
  row: TranscriptMessageRow;
};

export function ChatTranscriptMessageRow(props: ChatTranscriptMessageRowProps) {
  const serverSourceLabel =
    props.listKind === 'server'
      ? getServerMessageSourceLabel(props.row.message)
      : null;
  const shouldUseCompactRow =
    props.listKind === 'server' || isCompactMessage(props.row.message);
  const participant = resolveMessageParticipantPresentation({
    allowParticipantQuery: !!props.onOpenParticipantQuery,
    channelUserModesByNick: props.channelUserModesByNick,
    highlightMode: props.participantHighlightMode,
    listKind: props.listKind,
    message: props.row.message,
    rowVariant: shouldUseCompactRow ? 'compact' : 'full',
    senderLabel: serverSourceLabel,
  });

  if (shouldUseCompactRow) {
    return (
      <ChatPaneCompactMessageRow
        message={props.row.message}
        participant={participant}
        hideTimestamp={props.row.hideTimestamp}
        mode={props.mode}
        onInlinePreviewLoad={props.onInlinePreviewLoad}
        onOpenChannel={props.onOpenChannel}
        onOpenParticipantQuery={props.onOpenParticipantQuery}
      />
    );
  }

  return (
    <ChatPaneExpandedMessageRow
      message={props.row.message}
      mode={props.mode}
      onInlinePreviewLoad={props.onInlinePreviewLoad}
      onOpenChannel={props.onOpenChannel}
      onOpenParticipantQuery={props.onOpenParticipantQuery}
      participant={participant}
    />
  );
}
