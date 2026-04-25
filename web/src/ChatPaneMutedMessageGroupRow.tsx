import { VolumeX } from 'lucide-react';
import type { ChannelUserMode } from '../../shared/protocol.js';
import { cn } from '@/lib/utils.js';
import type { ChatTranscriptMutedGroupRow } from './chat-transcript-model.js';
import { ChatTranscriptMessageRow } from './ChatTranscriptMessageRow.js';
import type { MessageDisplayMode } from './message-display-mode.js';
import type { ParticipantHighlightMode } from './message-participant-presentation.js';

type ChatPaneMutedMessageGroupRowProps = {
  channelUserModesByNick: ReadonlyMap<string, ChannelUserMode>;
  expanded: boolean;
  listKind: 'chat' | 'server';
  mode: MessageDisplayMode;
  onInlinePreviewLoad?: () => void;
  onOpenChannel: (channel: string) => void;
  onOpenParticipantQuery?: (nick: string) => void;
  onToggle: (key: string) => void;
  participantHighlightMode: ParticipantHighlightMode;
  row: ChatTranscriptMutedGroupRow;
};

export function ChatPaneMutedMessageGroupRow(props: ChatPaneMutedMessageGroupRowProps) {
  const messageNoun = props.row.messageCount === 1 ? 'message' : 'messages';
  const summary = `${props.row.messageCount} muted ${messageNoun} from ${props.row.nick}`;
  const action = props.expanded ? 'Hide' : 'Show';

  return (
    <div className="px-1 py-0.5 font-sans text-[12px] text-muted-foreground">
      <button
        type="button"
        aria-expanded={props.expanded}
        aria-label={`${action} ${summary}`}
        className={cn(
          'grid w-full grid-cols-[max-content_minmax(0,1fr)] items-center gap-x-2 rounded-sm px-0 py-1 text-left',
          'transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/60',
        )}
        onClick={() => props.onToggle(props.row.key)}
      >
        <span
          aria-hidden
          className="flex h-5 w-[4.25rem] items-center justify-end gap-1 font-sans text-[11px] uppercase tracking-[0.08em]"
        >
          <VolumeX className="size-3" />
          Muted
        </span>
        <span className="min-w-0 truncate">
          {props.expanded ? `${action} ${summary}` : summary}
        </span>
      </button>
      {props.expanded ? (
        <div className="mt-1 border-l border-dashed border-white/12 pl-3 opacity-70">
          {props.row.messageRows.map((row) => (
            <ChatTranscriptMessageRow
              key={row.key}
              row={row}
              channelUserModesByNick={props.channelUserModesByNick}
              listKind={props.listKind}
              mode={props.mode}
              onInlinePreviewLoad={props.onInlinePreviewLoad}
              onOpenChannel={props.onOpenChannel}
              onOpenParticipantQuery={props.onOpenParticipantQuery}
              participantHighlightMode={props.participantHighlightMode}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
